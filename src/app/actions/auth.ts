"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { checkPassword, endSession, hashPassword, requireUser, startSession } from "@/lib/auth";
import { appUrl, sendEmail } from "@/lib/email";
import { can } from "@/lib/permissions";
import { DEMO_EMAILS } from "@/lib/demo";

export type FormState = { error?: string; success?: string } | undefined;

const email = z.email("Enter a valid email").transform((v) => v.toLowerCase().trim());
const password = z.string().min(8, "Password must be at least 8 characters");

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z.object({ email, password: z.string().min(1) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter your email and password." };
  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !(await checkPassword(parsed.data.password, user.passwordHash))) {
    return { error: "That email and password don't match." };
  }
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
  redirect("/login");
}

export async function forgotPassword(_: FormState, form: FormData): Promise<FormState> {
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) return { error: "Enter a valid email." };
  const user = await db.user.findUnique({ where: { email: parsed.data } });
  if (user) {
    const token = randomBytes(24).toString("hex");
    await db.passwordReset.create({ data: { token, userId: user.id, expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
    await sendEmail(
      user.email,
      "Reset your BuildTrace password",
      `Someone asked to reset your password. This link works for one hour:\n\n${appUrl(`/reset-password/${token}`)}\n\nIf it wasn't you, ignore this email.`,
    );
  }
  // Same answer either way so the form can't be used to check which emails exist.
  return { success: "If that email has an account, a reset link is on its way." };
}

export async function resetPassword(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z.object({ token: z.string(), password }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const reset = await db.passwordReset.findUnique({ where: { token: parsed.data.token }, include: { user: true } });
  if (!reset || reset.usedAt || reset.expiresAt < new Date()) return { error: "This reset link has expired. Ask for a new one." };
  await db.$transaction([
    db.user.update({ where: { id: reset.userId }, data: { passwordHash: await hashPassword(parsed.data.password) } }),
    db.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
  ]);
  await startSession(reset.user);
  redirect("/dashboard");
}

export async function inviteUser(_: FormState, form: FormData): Promise<FormState> {
  const me = await requireUser();
  if (!can.inviteUsers(me.role)) return { error: "Only owners and admins can invite people." };
  const parsed = z
    .object({ email, role: z.enum(["ADMIN", "OWNER", "MANAGER", "SUPERVISOR", "CONTRACTOR"]) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (await db.user.findUnique({ where: { email: parsed.data.email } })) return { error: "That person already has an account." };
  const token = randomBytes(24).toString("hex");
  await db.invite.create({
    data: { email: parsed.data.email, role: parsed.data.role as Role, token, companyId: me.companyId, expiresAt: new Date(Date.now() + 7 * 864e5) },
  });
  const link = appUrl(`/invite/${token}`);
  await sendEmail(parsed.data.email, `${me.name} invited you to ${me.company.name} on BuildTrace`, `Join the team here (valid for 7 days):\n\n${link}`);
  return { success: `Invite sent. You can also share this link: ${link}` };
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
