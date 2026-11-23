"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { endSession, requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { parseMoney } from "@/lib/money";
import type { Role } from "@prisma/client";
import { DELEGABLE_ROLES } from "@/lib/release";
import { ROLE_LABEL } from "@/lib/permissions";
import { audit } from "@/lib/notify";
import { format } from "date-fns";
import { NAME_WINDOW_DAYS, nameChangeAllowed } from "@/lib/names";
import { filesFrom, storeFile } from "@/lib/storage";
import type { FormState } from "./auth";

export async function markAllRead() {
  const user = await requireUser();
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}

export async function markRead(id: string) {
  const user = await requireUser();
  await db.notification.updateMany({ where: { id, userId: user.id }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}

export async function updateCompany(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  if (user.role !== "OWNER" && user.role !== "ADMIN") return { error: "Only owners and admins can change company settings." };
  const parsed = z
    .object({ name: z.string().min(2), currency: z.enum(["USD", "NGN", "GBP", "EUR"]), threshold: z.string() })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Check the fields and try again." };
  const threshold = parseMoney(parsed.data.threshold);
  if (threshold === null) return { error: "Enter the approval limit as a number." };
  const name = parsed.data.name.trim().replace(/\s+/g, " ");
  const renamed = name !== user.company.name;
  if (renamed) {
    const check = await canRename("COMPANY", user.companyId);
    if (!check.ok) return { error: `The company name can change twice in 20 days. Next change: ${format(check.nextAt, "MMM d, h:mm a")}.` };
  }
  let logoUrl: string | undefined;
  const logo = filesFrom(form, "logo")[0];
  if (logo) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(logo.type)) return { error: "Use a PNG, JPG or WebP logo." };
    if (logo.size > 2 * 1024 * 1024) return { error: "Keep the logo under 2 MB." };
    logoUrl = await storeFile(logo, `companies/${user.companyId}`);
  }
  await db.$transaction([
    db.company.update({
      where: { id: user.companyId },
      data: { name, currency: parsed.data.currency, approvalThreshold: threshold, ...(logoUrl && { logoUrl }), ...(form.get("removeLogo") === "on" && !logoUrl && { logoUrl: null }) },
    }),
    ...(renamed ? [db.nameChange.create({ data: { subjectType: "COMPANY", subjectId: user.companyId, fromName: user.company.name, toName: name, changedById: user.id } })] : []),
  ]);
  if (renamed) await audit(user.id, `renamed the company from "${user.company.name}" to "${name}"`, "Company", user.companyId);
  if (logoUrl) await audit(user.id, "changed the company logo", "Company", user.companyId);
  revalidatePath("/", "layout");
  return { success: "Settings saved." };
}

async function canRename(subjectType: "USER" | "COMPANY", subjectId: string) {
  const since = new Date(Date.now() - NAME_WINDOW_DAYS * 864e5);
  const recent = await db.nameChange.findMany({ where: { subjectType, subjectId, createdAt: { gt: since } }, select: { createdAt: true } });
  return nameChangeAllowed(recent.map((r) => r.createdAt));
}

/** Changes your own name. At most twice in any 20 days, so signatures and records stay recognisable. */
export async function updateMyName(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) return { error: "Enter your full name." };
  if (name === user.name) return { error: "That's already your name." };
  const check = await canRename("USER", user.id);
  if (!check.ok) return { error: `You can change your name twice in 20 days. Next change: ${format(check.nextAt, "MMM d, h:mm a")}.` };
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { name } }),
    db.nameChange.create({ data: { subjectType: "USER", subjectId: user.id, fromName: user.name, toName: name, changedById: user.id } }),
  ]);
  await audit(user.id, `changed their name from "${user.name}" to "${name}"`, "User", user.id);
  revalidatePath("/", "layout");
  return { success: check.left > 1 ? "Name changed. You can change it once more in the next 20 days." : "Name changed." };
}

/** Owner only: the amount that needs two people, and which roles can sign in the owner's place. */
export async function updateApprovals(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  if (user.role !== "OWNER") return { error: "Only the owner can change who approves payments." };
  const rawFrom = String(form.get("twoFrom") ?? "").trim();
  const twoFrom = rawFrom ? parseMoney(rawFrom) : 0;
  if (twoFrom === null || twoFrom < 0) return { error: "Enter an amount, or 0 so every payment needs two people." };
  const roles = form.getAll("delegateRoles").map(String).filter((r): r is Role => (DELEGABLE_ROLES as string[]).includes(r));
  const until = String(form.get("delegationEndsAt") ?? "");
  const endsAt = until ? new Date(`${until}T23:59:59`) : null;
  if (endsAt && endsAt < new Date()) return { error: "Pick an end date in the future, or leave it empty." };
  await db.company.update({ where: { id: user.companyId }, data: { twoPersonFrom: twoFrom, ownerDelegateRoles: roles, delegationEndsAt: roles.length ? endsAt : null } });
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: user.company.currency, maximumFractionDigits: 0 }).format(twoFrom / 100);
  const scope = twoFrom ? `payments of ${money} or more` : "all payments";
  const delegates = roles.length ? `${roles.map((r) => ROLE_LABEL[r]).join(" and ")} can sign for the owner${endsAt ? ` until ${endsAt.toDateString()}` : ""}` : "nobody signs for the owner";
  await audit(
    user.id,
    `set ${scope} to need two people; ${delegates}`,
    "Company",
    user.companyId,
  );
  revalidatePath("/", "layout");
  return { success: "Saved." };
}

/** Ends every session for this account, on every device, including this one. */
export async function signOutEverywhere() {
  const user = await requireUser();
  // The shared demo accounts are used by many visitors at once, so they can't sign each other out.
  if (!user.email.endsWith("@demo.trussly.app")) {
    await db.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } });
    await audit(user.id, "signed out on every device", "User", user.id);
  }
  await endSession();
  redirect("/login");
}
