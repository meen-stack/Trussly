"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getProjectForUser } from "@/lib/access";
import { formatMoney, parseMoney } from "@/lib/money";
import { canDecideChange, canProposeChange, decideChange } from "@/lib/commercial";
import { actsForOwner, ownerSideRoles } from "@/lib/release";
import { addConfirmation, clearConfirmations } from "@/lib/confirmations";
import { fingerprint } from "@/lib/signature";
import { audit, notifyProjectRoles, notifyUsers } from "@/lib/notify";
import type { FormState } from "./auth";

const DAY = 864e5;

function refresh(projectId: string) {
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/approvals");
  revalidatePath("/analytics");
}

export async function proposeChange(projectId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const project = await getProjectForUser(user, projectId);
  if (!canProposeChange(user.role)) return { error: "Your role can't propose change orders." };
  const parsed = z
    .object({
      title: z.string().min(3, "Give the change a title"),
      reason: z.string().min(5, "Say why the change is needed"),
      amount: z.string().min(1, "Enter the cost"),
      budgetLineId: z.string().min(1, "Pick a budget line"),
      milestoneId: z.string().optional(),
      daysImpact: z.coerce.number().int().min(-365).max(365).default(0),
      saving: z.string().optional(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const cost = parseMoney(d.amount);
  if (cost === null || cost === 0) return { error: "Enter the cost as a number." };
  const amount = d.saving ? -Math.abs(cost) : Math.abs(cost);
  const line = await db.budgetLine.findFirst({ where: { id: d.budgetLineId, projectId: project.id } });
  if (!line) return { error: "Pick a budget line." };
  const work = d.milestoneId ? await db.milestone.findFirst({ where: { id: d.milestoneId, projectId: project.id } }) : null;
  if (d.milestoneId && !work) return { error: "Pick work on this project." };
  if (work && user.role === "CONTRACTOR" && work.assigneeId && work.assigneeId !== user.id) return { error: "You can only propose changes to your own work." };

  const number = (await db.changeOrder.count({ where: { projectId: project.id } })) + 1;
  const co = await db.changeOrder.create({
    data: { projectId: project.id, number, title: d.title, reason: d.reason, amount, daysImpact: d.daysImpact, budgetLineId: line.id, milestoneId: work?.id ?? null, requestedById: user.id },
  });
  const money = formatMoney(amount, user.company.currency);
  await audit(user.id, `proposed change order CO-${number} "${d.title}" (${money})`, "ChangeOrder", co.id, project.id);
  const over = Math.abs(amount) > user.company.approvalThreshold;
  await notifyProjectRoles(
    project.id,
    over ? ["MANAGER", "OWNER"] : ["MANAGER"],
    { title: `Change order CO-${number}: ${money}`, body: `${user.name} proposed "${d.title}" on ${project.name}.${over ? " It's over the limit, so the owner decides." : ""}`, href: `/projects/${project.id}/changes` },
    user.id,
  );
  refresh(project.id);
  return { success: `CO-${number} proposed.` };
}

/** Approve (with a typed signature) or reject. Approval adds the amount to the budget line and work value, and moves the end date. */
export async function decideChangeOrder(projectId: string, changeId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const project = await getProjectForUser(user, projectId);
  const co = await db.changeOrder.findFirst({ where: { id: changeId, projectId: project.id }, include: { budgetLine: true } });
  if (!co) return { error: "Change order not found." };
  const company = user.company;
  const approve = form.get("decision") === "approve";
  const note = String(form.get("note") ?? "").trim() || null;
  const signedName = String(form.get("signature") ?? "").trim();
  const href = `/projects/${project.id}/changes`;
  const money = formatMoney(co.amount, company.currency);

  if (!approve) {
    const ownerSide = actsForOwner(user.role, company);
    let result = decideChange(co.status, false, user.role, co.amount, company.approvalThreshold);
    if (!result.ok && ownerSide) result = decideChange(co.status, false, "OWNER", co.amount, company.approvalThreshold);
    if (!result.ok) return { error: result.error };
    if (!note) return { error: "Say why it's rejected." };
    await db.changeOrder.update({ where: { id: co.id }, data: { status: "REJECTED", decidedById: user.id, decisionNote: note, decidedAt: new Date() } });
    await clearConfirmations("CHANGE_ORDER", co.id);
    await audit(user.id, `rejected change order CO-${co.number} (${money})`, "ChangeOrder", co.id, project.id, { note });
    await notifyUsers([co.requestedById], { title: `Change order CO-${co.number} rejected`, body: note, href });
    refresh(project.id);
    return { success: "Rejected." };
  }

  if (co.status !== "PROPOSED") return { error: "This change order has already been decided." };
  if (form.get("confirm") !== "on") return { error: "Tick the box to confirm the change and what the money is for." };
  if (signedName.toLowerCase() !== user.name.toLowerCase()) return { error: `Type your full name (${user.name}) to sign.` };
  const confirmed = await addConfirmation({
    user,
    projectId: project.id,
    kind: "CHANGE_ORDER",
    targetId: co.id,
    amount: co.amount,
    // Savings don't release money, so one approval is enough.
    two: co.amount > 0 ? undefined : false,
    requesterId: co.requestedById,
    statement: `The change is needed and the money is for: ${co.reason}`,
    singleOk: (role) => canDecideChange(role, co.amount, company.approvalThreshold),
  });
  if (!confirmed.ok) return { error: confirmed.error };
  const role = confirmed.asOwner ? "OWNER" : user.role;
  const behalf = confirmed.asOwner ? " on behalf of the owner" : "";
  const now = new Date();
  const signature = db.signature.create({
    data: { changeOrderId: co.id, userId: user.id, signedName, role, fingerprint: fingerprint([co.id, co.number, co.amount, co.title, user.id, signedName, now.toISOString()]), signedAt: now },
  });

  if (!confirmed.complete) {
    await signature;
    await audit(user.id, `confirmed and signed change order CO-${co.number} (${money})${behalf}`, "ChangeOrder", co.id, project.id, note ? { note } : undefined);
    const next = role === "OWNER" ? (["MANAGER", "FINANCE"] as const) : ownerSideRoles(company);
    await notifyProjectRoles(project.id, [...next], { title: `Second signature needed: CO-${co.number}`, body: `${user.name} signed ${co.title} (${money}). One more person must sign before it's approved.`, href }, user.id);
    refresh(project.id);
    return { success: "Signed. One more person must sign." };
  }

  await db.$transaction([
    db.changeOrder.update({ where: { id: co.id }, data: { status: "APPROVED", decidedById: user.id, decisionNote: note, decidedAt: now } }),
    db.budgetLine.update({ where: { id: co.budgetLineId }, data: { budgeted: { increment: co.amount } } }),
    ...(co.milestoneId ? [db.milestone.update({ where: { id: co.milestoneId }, data: { paymentAmount: { increment: co.amount } } })] : []),
    ...(co.daysImpact ? [db.project.update({ where: { id: project.id }, data: { endDate: new Date(project.endDate.getTime() + co.daysImpact * DAY) } })] : []),
    signature,
  ]);
  await audit(user.id, `approved and signed change order CO-${co.number} (${money})${behalf}`, "ChangeOrder", co.id, project.id, {
    ...(note && { note }),
    budgetLine: co.budgetLine.category,
    from: co.budgetLine.budgeted,
    to: co.budgetLine.budgeted + co.amount,
    days: co.daysImpact,
  });
  await notifyUsers([co.requestedById], {
    title: `Change order CO-${co.number} approved`,
    body: `${co.title}: ${money} added to ${co.budgetLine.category}${co.daysImpact ? `, ${co.daysImpact} days on the schedule` : ""}.`,
    href,
  });
  refresh(project.id);
  return { success: "Approved and signed." };
}
