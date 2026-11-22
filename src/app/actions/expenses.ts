"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getProjectForUser } from "@/lib/access";
import { can } from "@/lib/permissions";
import { formatMoney, parseMoney } from "@/lib/money";
import { applyPayment, nextInvoiceStatus, payable, retentionFor, statusAfterRelease, type InvoiceAction } from "@/lib/workflow";
import { summarizeLine, WARN_AT } from "@/lib/budget";
import { paidOf } from "@/lib/status";
import { blocksPayment, canReleaseRetention, retentionHeld } from "@/lib/commercial";
import { audit, notifyProjectRoles, notifyUsers } from "@/lib/notify";
import { actsForOwner, ownerSideRoles } from "@/lib/release";
import { addConfirmation, clearConfirmations } from "@/lib/confirmations";
import { filesFrom, storeFile } from "@/lib/storage";
import type { FormState } from "./auth";

const DAY = 864e5;

function refresh(projectId: string) {
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/approvals");
  revalidatePath("/finance");
  revalidatePath("/dashboard");
}

export async function submitExpense(projectId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const project = await getProjectForUser(user, projectId);
  if (!can.submitExpense(user.role)) return { error: "Your role can't submit invoices." };
  const parsed = z
    .object({
      budgetLineId: z.string().min(1, "Pick a budget line"),
      milestoneId: z.string().optional(),
      vendor: z.string().min(2, "Add the vendor"),
      description: z.string().min(2, "Describe what it's for"),
      amount: z.string(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const amount = parseMoney(parsed.data.amount);
  if (!amount) return { error: "Enter the amount as a number." };
  const line = await db.budgetLine.findFirst({ where: { id: parsed.data.budgetLineId, projectId: project.id } });
  if (!line) return { error: "Pick a budget line." };

  const work = parsed.data.milestoneId ? await db.milestone.findFirst({ where: { id: parsed.data.milestoneId, projectId: project.id } }) : null;
  if (parsed.data.milestoneId && !work) return { error: "Pick work on this project." };
  if (work && user.role === "CONTRACTOR" && work.assigneeId && work.assigneeId !== user.id) return { error: "You can only invoice for your own work." };

  const invoice = filesFrom(form, "invoice")[0];
  let invoiceUrl: string | null = null;
  if (invoice) {
    try {
      invoiceUrl = await storeFile(invoice, `projects/${project.id}/invoices`);
    } catch (e) {
      return { error: (e as Error).message };
    }
  }
  // Retention is held on contractor invoices for work, and released at handover.
  const retention = work ? retentionFor(amount, user.company.retentionPercent) : 0;
  const expense = await db.expense.create({
    data: {
      budgetLineId: line.id,
      milestoneId: work?.id ?? null,
      submitterId: user.id,
      vendor: parsed.data.vendor,
      description: parsed.data.description,
      amount,
      retention,
      invoiceUrl,
      dueDate: new Date(Date.now() + user.company.paymentTermsDays * DAY),
    },
  });
  const money = formatMoney(amount, user.company.currency);
  await audit(user.id, `submitted a ${money} invoice${work ? ` for "${work.title}"` : ` for ${line.category}`}`, "Expense", expense.id, project.id);
  await notifyProjectRoles(
    project.id,
    ["MANAGER"],
    {
      title: `New invoice: ${money}`,
      body: `${user.name} submitted ${parsed.data.vendor}${work ? ` for "${work.title}"` : ""} on ${project.name}.${work && work.status !== "VERIFIED" ? " The work isn't verified yet." : ""}`,
      href: `/projects/${project.id}/budget`,
    },
    user.id,
  );
  refresh(project.id);
  return { success: work && work.status !== "VERIFIED" ? "Invoice submitted. It can be approved once the work is verified." : "Invoice submitted for approval." };
}

async function loadInvoice(projectId: string, expenseId: string) {
  const user = await requireUser();
  const project = await getProjectForUser(user, projectId);
  const expense = await db.expense.findFirst({
    where: { id: expenseId, budgetLine: { projectId: project.id } },
    include: { budgetLine: true, milestone: true, payments: true, disputes: { select: { status: true } } },
  });
  return { user, project, expense };
}

/** Manager and owner decisions on an invoice. */
export async function decideExpense(projectId: string, expenseId: string, _: FormState, form: FormData): Promise<FormState> {
  const { user, project, expense } = await loadInvoice(projectId, expenseId);
  if (!expense) return { error: "Invoice not found." };
  const action = form.get("decision") === "approve" ? "approve" : "reject";
  const note = String(form.get("note") ?? "").trim() || null;
  if (action === "reject" && !note) return { error: "Say why it's rejected." };
  const company = user.company;
  const ctx = { amount: expense.amount, threshold: company.approvalThreshold, workStatus: expense.milestone?.status, twoFrom: company.twoPersonFrom };
  // Someone whose role the owner has delegated can decide where the owner would.
  const role = expense.status === "OWNER_REVIEW" && actsForOwner(user.role, company) ? "OWNER" : user.role;
  const result = nextInvoiceStatus(expense.status, action, role, ctx);
  if (!result.ok) return { error: result.error };
  let onBehalf = false;
  if (action === "approve") {
    if (form.get("confirm") !== "on") return { error: "Tick the box to confirm the invoice and what the money is for." };
    const confirmed = await addConfirmation({
      user,
      projectId: project.id,
      kind: "INVOICE",
      targetId: expense.id,
      amount: expense.amount,
      requesterId: expense.submitterId,
      statement: `Invoice is genuine. The money is for: ${expense.description}`,
      singleOk: () => true,
    });
    if (!confirmed.ok) return { error: confirmed.error };
    onBehalf = confirmed.asOwner;
  } else {
    await clearConfirmations("INVOICE", expense.id);
  }

  await db.expense.update({
    where: { id: expense.id },
    data: { status: result.next, reviewNote: note, decidedAt: result.next === "APPROVED" || result.next === "REJECTED" ? new Date() : null },
  });
  const money = formatMoney(expense.amount, company.currency);
  const label = `${money} from ${expense.vendor}`;
  await audit(
    user.id,
    (result.next === "OWNER_REVIEW" ? `confirmed ${label} and sent it to the owner` : `${action === "approve" ? "confirmed" : "rejected"} ${label}`) + (onBehalf ? " on behalf of the owner" : ""),
    "Expense",
    expense.id,
    project.id,
    note ? { note } : undefined,
  );

  const href = `/projects/${project.id}/budget`;
  if (result.next === "OWNER_REVIEW") {
    await notifyProjectRoles(project.id, ownerSideRoles(company), { title: `Invoice approval needed: ${money}`, body: `${user.name} has confirmed it. It needs your confirmation too before it can be paid.`, href });
  } else if (result.next === "APPROVED") {
    await notifyUsers([expense.submitterId], { title: `Invoice approved: ${money}`, body: `${expense.vendor}. It's now with finance for payment.`, href });
    await notifyProjectRoles(project.id, ["FINANCE"], { title: `Ready to pay: ${money}`, body: `${expense.vendor} on ${project.name} is approved for payment.`, href: "/finance" });
  } else {
    await notifyUsers([expense.submitterId], { title: `Invoice rejected: ${money}`, body: note ?? "", href });
  }

  // Overrun warning: tell managers and owners the moment a line crosses 90% or 100%.
  if (result.next === "APPROVED") {
    const line = await db.budgetLine.findUniqueOrThrow({ where: { id: expense.budgetLineId }, include: { expenses: true } });
    const after = summarizeLine(line);
    const before = (after.spent - expense.amount) / (line.budgeted || 1);
    const crossed = (before < WARN_AT && after.ratio >= WARN_AT) || (before <= 1 && after.ratio > 1);
    if (crossed) {
      await notifyProjectRoles(project.id, ["OWNER", "MANAGER"], {
        title: `${after.state === "over" ? "Over budget" : "Budget warning"}: ${line.category}`,
        body: `${project.name}: ${line.category} is at ${Math.round(after.ratio * 100)}% of its ${formatMoney(line.budgeted, company.currency)} budget.`,
        href,
      });
    }
  }
  refresh(project.id);
  return { success: "Saved." };
}

/** Finance: start processing, record a payment, or refuse payment. */
export async function payExpense(projectId: string, expenseId: string, _: FormState, form: FormData): Promise<FormState> {
  const { user, project, expense } = await loadInvoice(projectId, expenseId);
  if (!expense) return { error: "Invoice not found." };
  const action = String(form.get("action")) as Extract<InvoiceAction, "process" | "pay" | "rejectPayment">;
  const note = String(form.get("note") ?? "").trim() || null;
  const company = user.company;
  const step = nextInvoiceStatus(expense.status, action, user.role, { amount: expense.amount, threshold: company.approvalThreshold });
  if (!step.ok) return { error: step.error };
  if ((action === "pay" || action === "process") && blocksPayment(expense.disputes)) return { error: "This invoice is in dispute. Resolve the dispute before paying." };
  const money = (c: number) => formatMoney(c, company.currency);
  const href = `/projects/${project.id}/budget`;

  if (action === "process") {
    await db.expense.update({ where: { id: expense.id }, data: { status: "PROCESSING" } });
    await audit(user.id, `started processing ${money(expense.amount)} to ${expense.vendor}`, "Expense", expense.id, project.id);
    await notifyUsers([expense.submitterId], { title: `Payment processing: ${money(expense.amount)}`, body: `${expense.vendor}. Finance has scheduled your payment.`, href });
  } else if (action === "rejectPayment") {
    if (!note) return { error: "Say why the payment is refused." };
    await db.expense.update({ where: { id: expense.id }, data: { status: "PAYMENT_REJECTED", reviewNote: note } });
    await audit(user.id, `refused payment of ${money(expense.amount)} to ${expense.vendor}`, "Expense", expense.id, project.id, { note });
    await notifyUsers([expense.submitterId], { title: `Payment rejected: ${money(expense.amount)}`, body: note, href });
    await notifyProjectRoles(project.id, ["MANAGER"], { title: `Payment rejected: ${expense.vendor}`, body: note, href }, user.id);
  } else {
    const amount = parseMoney(String(form.get("amount") ?? ""));
    const paid = applyPayment(expense, paidOf(expense), amount ?? 0);
    if (!paid.ok) return { error: paid.error };
    const reference = String(form.get("reference") ?? "").trim() || null;
    await db.$transaction([
      db.payment.create({ data: { expenseId: expense.id, amount: amount!, reference, recordedById: user.id } }),
      db.expense.update({ where: { id: expense.id }, data: { status: paid.next } }),
    ]);
    const full = paid.next === "PAID";
    await audit(user.id, `paid ${money(amount!)} to ${expense.vendor}${full ? " (paid in full)" : ""}`, "Expense", expense.id, project.id, reference ? { reference } : undefined);
    await notifyUsers([expense.submitterId], {
      title: `Payment ${full ? "confirmed" : "received"}: ${money(amount!)}`,
      body: `${expense.vendor}${reference ? `, ref ${reference}` : ""}. ${full ? "This invoice is fully paid." : `Balance remaining: ${money(payable(expense) - paidOf(expense) - amount!)}.`}`,
      href,
    });
  }
  refresh(project.id);
  return { success: "Saved." };
}

/** Handover: release the retention held on this project's invoices, so finance can pay it. */
export async function releaseRetention(projectId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const project = await getProjectForUser(user, projectId);
  const company = user.company;
  const allowed = canReleaseRetention(user.role, project.status) || (project.status === "COMPLETED" && (user.role === "FINANCE" || actsForOwner(user.role, company)));
  if (!allowed) return { error: project.status === "COMPLETED" ? "Only the owner, manager or accountant can release retention." : "Retention is released at handover. Mark the project completed first." };
  if (form.get("confirm") !== "on") return { error: "Tick the box to confirm handover." };
  const invoices = retentionHeld(await db.expense.findMany({ where: { budgetLine: { projectId: project.id } } }));
  if (invoices.length === 0) return { error: "No retention is held on this project." };
  const total = invoices.reduce((s, e) => s + e.retention, 0);
  const money = (c: number) => formatMoney(c, company.currency);

  const confirmed = await addConfirmation({
    user,
    projectId: project.id,
    kind: "RETENTION",
    targetId: project.id,
    amount: total,
    statement: `Handover is complete. ${money(total)} of retention is owed to the contractors.`,
    singleOk: (role) => canReleaseRetention(role, project.status),
  });
  if (!confirmed.ok) return { error: confirmed.error };
  const behalf = confirmed.asOwner ? " on behalf of the owner" : "";
  if (!confirmed.complete) {
    await audit(user.id, `confirmed the release of ${money(total)} of retention${behalf}`, "Project", project.id, project.id);
    const waitingOn = confirmed.asOwner || user.role === "OWNER" ? (["MANAGER", "FINANCE"] as const) : ownerSideRoles(company);
    await notifyProjectRoles(project.id, [...waitingOn], { title: `Confirm retention release: ${money(total)}`, body: `${user.name} confirmed handover on ${project.name}. A second person must confirm before it's paid.`, href: `/projects/${project.id}/budget` }, user.id);
    refresh(project.id);
    return { success: "Confirmed. A second person must confirm before it's released." };
  }

  const now = new Date();
  const due = new Date(now.getTime() + company.paymentTermsDays * DAY);
  await db.$transaction([
    ...invoices.map((e) => db.expense.update({ where: { id: e.id }, data: { retentionReleasedAt: now, retentionReleasedById: user.id, status: statusAfterRelease(e.status), dueDate: e.status === "PAID" ? due : e.dueDate } })),
    // Later retention on this project needs fresh confirmations.
    db.confirmation.updateMany({ where: { kind: "RETENTION", targetId: project.id }, data: { targetId: `${project.id}:${now.getTime()}` } }),
  ]);
  await audit(user.id, `released ${money(total)} of retention on ${invoices.length} invoice${invoices.length === 1 ? "" : "s"} at handover${behalf}`, "Project", project.id, project.id);
  const bySubmitter = new Map<string, number>();
  for (const e of invoices) bySubmitter.set(e.submitterId, (bySubmitter.get(e.submitterId) ?? 0) + e.retention);
  for (const [id, amount] of bySubmitter) {
    await notifyUsers([id], { title: `Retention released: ${money(amount)}`, body: `${project.name} has been handed over. Finance will pay the retention held on your invoices.`, href: `/projects/${project.id}/budget` });
  }
  await notifyProjectRoles(project.id, ["FINANCE"], { title: `Retention to pay: ${money(total)}`, body: `${user.name} released retention on ${project.name} at handover.`, href: "/finance" });
  refresh(project.id);
  return { success: `Released ${money(total)}. Finance can now pay it.` };
}
