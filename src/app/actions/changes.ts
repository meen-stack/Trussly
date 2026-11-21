"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getProjectForUser } from "@/lib/access";
import { formatMoney, parseMoney } from "@/lib/money";
import { canProposeChange, decideChange } from "@/lib/commercial";
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
  const approve = form.get("decision") === "approve";
  const note = String(form.get("note") ?? "").trim() || null;
  const signedName = String(form.get("signature") ?? "").trim();
  const result = decideChange(co.status, approve, user.role, co.amount, user.company.approvalThreshold);
  if (!result.ok) return { error: result.error };
  if (!approve && !note) return { error: "Say why it's rejected." };
  if (approve && signedName.toLowerCase() !== user.name.toLowerCase()) return { error: `Type your full name (${user.name}) to sign.` };

  const now = new Date();
  await db.$transaction([
    db.changeOrder.update({ where: { id: co.id }, data: { status: result.next, decidedById: user.id, decisionNote: note, decidedAt: now } }),
    ...(approve
      ? [
          db.budgetLine.update({ where: { id: co.budgetLineId }, data: { budgeted: { increment: co.amount } } }),
          ...(co.milestoneId ? [db.milestone.update({ where: { id: co.milestoneId }, data: { paymentAmount: { increment: co.amount } } })] : []),
          ...(co.daysImpact ? [db.project.update({ where: { id: project.id }, data: { endDate: new Date(project.endDate.getTime() + co.daysImpact * DAY) } })] : []),
          db.signature.create({
            data: { changeOrderId: co.id, userId: user.id, signedName, role: user.role, fingerprint: fingerprint([co.id, co.number, co.amount, co.title, user.id, signedName, now.toISOString()]), signedAt: now },
          }),
        ]
      : []),
  ]);
  const money = formatMoney(co.amount, user.company.currency);
  await audit(user.id, `${approve ? "approved and signed" : "rejected"} change order CO-${co.number} (${money})`, "ChangeOrder", co.id, project.id, {
    ...(note && { note }),
    ...(approve && { budgetLine: co.budgetLine.category, from: co.budgetLine.budgeted, to: co.budgetLine.budgeted + co.amount, days: co.daysImpact }),
  });
  await notifyUsers([co.requestedById], {
    title: `Change order CO-${co.number} ${approve ? "approved" : "rejected"}`,
    body: approve ? `${co.title}: ${money} added to ${co.budgetLine.category}${co.daysImpact ? `, ${co.daysImpact} days on the schedule` : ""}.` : (note ?? ""),
    href: `/projects/${project.id}/changes`,
  });
  refresh(project.id);
  return { success: approve ? "Approved and signed." : "Rejected." };
}
