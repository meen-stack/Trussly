"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseMoney } from "@/lib/money";
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
