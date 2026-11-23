"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { checkPassword, endSession, hashPassword, requireUser, startSession } from "@/lib/auth";
import { appUrl, sendEmail } from "@/lib/email";
import { can } from "@/lib/permissions";
import { DEMO_EMAILS } from "@/lib/demo";
import { afterFailedLogin, lockedFor } from "@/lib/lockout";
import { audit } from "@/lib/notify";

export type FormState = { error?: string; success?: string } | undefined;

const email = z.email("Enter a valid email").transform((v) => v.toLowerCase().trim());
const password = z.string().min(8, "Password must be at least 8 characters");

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z.object({ email, password: z.string().min(1) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter your email and password." };
  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  const minutes = lockedFor(user?.lockedUntil ?? null);
  if (minutes > 0) return { error: `Too many wrong passwords. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or reset your password.` };
  if (!user || !(await checkPassword(parsed.data.password, user.passwordHash))) {
    if (user) await db.user.update({ where: { id: user.id }, data: afterFailedLogin(user.failedLogins) });
    return { error: "That email and password don't match." };
  }
  if (user.failedLogins > 0 || user.lockedUntil) await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  await startSession(user);
  redirect("/dashboard");
}

export async function signup(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z
    .object({ name: z.string().min(2, "Enter your name"), company: z.string().min(2, "Enter your company name"), email, password })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, company, email: em, password: pw } = parsed.data;
  if (await db.user.findUnique({ where: { email: em } })) return { error: "An account with that email already exists." };
  const user = await db.user.create({
    data: {
      name,
      email: em,
      passwordHash: await hashPassword(pw),
      role: "OWNER",
      title: "Owner",
      company: { create: { name: company } },
    },
  });
  await startSession(user);
  redirect("/dashboard");
}

export async function logout() {
  await endSession();
  redirect("/");
}

export async function forgotPassword(_: FormState, form: FormData): Promise<FormState> {
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) return { error: "Enter a valid email." };
  const user = await db.user.findUnique({ where: { email: parsed.data }, include: { company: true } });
  if (user) {
    const token = randomBytes(24).toString("hex");
    await db.passwordReset.create({ data: { token, userId: user.id, expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
    await sendEmail(user.email, "Reset your password", "Someone asked to reset your Trussly password. The link works for one hour. If it wasn't you, ignore this email.", {
      brand: user.company,
      action: { label: "Reset password", url: appUrl(`/reset-password/${token}`) },
    });
  }
  // Same answer either way so the form can't be used to check which emails exist.
  return { success: "If that email has an account, a reset link is on its way." };
}

export async function resetPassword(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z.object({ token: z.string(), password }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const reset = await db.passwordReset.findUnique({ where: { token: parsed.data.token }, include: { user: true } });
  if (!reset || reset.usedAt || reset.expiresAt < new Date()) return { error: "This reset link has expired. Ask for a new one." };
  // A new password signs out every other session, clears any lockout and kills older reset links.
  const [user] = await db.$transaction([
    db.user.update({
      where: { id: reset.userId },
      data: { passwordHash: await hashPassword(parsed.data.password), sessionVersion: { increment: 1 }, failedLogins: 0, lockedUntil: null },
    }),
    db.passwordReset.updateMany({ where: { userId: reset.userId, usedAt: null }, data: { usedAt: new Date() } }),
  ]);
  await audit(user.id, "reset their password and signed out everywhere", "User", user.id);
  await startSession(user);
  redirect("/dashboard");
}

export async function inviteUser(_: FormState, form: FormData): Promise<FormState> {
  const me = await requireUser();
  if (!can.inviteUsers(me.role)) return { error: "Only owners and admins can invite people." };
  const parsed = z
    .object({ email, role: z.enum(["ADMIN", "OWNER", "MANAGER", "SUPERVISOR", "CONTRACTOR", "FINANCE"]) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (await db.user.findUnique({ where: { email: parsed.data.email } })) return { error: "That person already has an account." };
  const token = randomBytes(24).toString("hex");
  await db.invite.create({
    data: { email: parsed.data.email, role: parsed.data.role as Role, token, companyId: me.companyId, expiresAt: new Date(Date.now() + 7 * 864e5) },
  });
  revalidatePath("/team");
  const result = await emailInvite(parsed.data.email, token, me.name, me.company);
  if (result.sent) return { success: `Invite emailed to ${parsed.data.email}.` };
  return { error: `Invite made, but the email didn't send (${result.reason}). Copy the link under Pending invites and send it yourself.` };
}

function emailInvite(to: string, token: string, from: string, company: { name: string; logoUrl: string | null }) {
  return sendEmail(to, `Join ${company.name} on Trussly`, `${from} invited you to join ${company.name}. The link works for 7 days.`, {
    brand: company,
    action: { label: "Join the team", url: appUrl(`/invite/${token}`) },
  });
}

/** Emails a pending invite again, with a fresh 7 days. */
export async function resendInvite(_: FormState, form: FormData): Promise<FormState> {
  const me = await requireUser();
  if (!can.inviteUsers(me.role)) return { error: "Only owners and admins can invite people." };
  const invite = await db.invite.findFirst({ where: { id: String(form.get("inviteId")), companyId: me.companyId, usedAt: null } });
  if (!invite) return { error: "That invite was already used." };
  await db.invite.update({ where: { id: invite.id }, data: { expiresAt: new Date(Date.now() + 7 * 864e5) } });
  revalidatePath("/team");
  const result = await emailInvite(invite.email, invite.token, me.name, me.company);
  return result.sent ? { success: "Sent" } : { error: `Not sent: ${result.reason}` };
}

/** Withdraws a pending invite so its link stops working. */
export async function cancelInvite(form: FormData) {
  const me = await requireUser();
  if (!can.inviteUsers(me.role)) return;
  await db.invite.deleteMany({ where: { id: String(form.get("inviteId")), companyId: me.companyId, usedAt: null } });
  revalidatePath("/team");
}

export async function acceptInvite(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z.object({ token: z.string(), name: z.string().min(2, "Enter your name"), password }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const invite = await db.invite.findUnique({ where: { token: parsed.data.token } });
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) return { error: "This invite has expired. Ask for a new one." };
  if (await db.user.findUnique({ where: { email: invite.email } })) return { error: "That email already has an account. Log in instead." };
  const user = await db.user.create({
    data: {
      name: parsed.data.name,
      email: invite.email,
      passwordHash: await hashPassword(parsed.data.password),
      role: invite.role,
      companyId: invite.companyId,
    },
  });
  await db.invite.update({ where: { id: invite.id }, data: { usedAt: new Date() } });
  await startSession(user);
  redirect("/dashboard");
}


/** One-click login into the seeded demo company, so visitors can try each role. */
export async function demoLogin(form: FormData) {
  const role = String(form.get("role"));
  const user = await db.user.findUnique({ where: { email: DEMO_EMAILS[role] ?? "" } });
  if (!user) redirect("/login?demo=missing");
  await startSession(user);
  redirect("/dashboard");
}
