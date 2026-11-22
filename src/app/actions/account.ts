"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseMoney } from "@/lib/money";
import type { Role } from "@prisma/client";
import { DELEGABLE_ROLES } from "@/lib/release";
import { ROLE_LABEL } from "@/lib/permissions";
import { audit } from "@/lib/notify";
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
  await db.company.update({
    where: { id: user.companyId },
    data: { name: parsed.data.name, currency: parsed.data.currency, approvalThreshold: threshold },
  });
  revalidatePath("/", "layout");
  return { success: "Settings saved." };
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
