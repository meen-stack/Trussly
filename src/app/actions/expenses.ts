"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getProjectForUser } from "@/lib/access";
import { can } from "@/lib/permissions";
import { formatMoney, parseMoney } from "@/lib/money";
import { applyPayment, nextInvoiceStatus, retentionFor, type InvoiceAction } from "@/lib/workflow";
import { summarizeLine, WARN_AT } from "@/lib/budget";
import { paidOf } from "@/lib/status";
import { audit, notifyProjectRoles, notifyUsers } from "@/lib/notify";
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
    include: { budgetLine: true, milestone: true, payments: true },
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
  const result = nextInvoiceStatus(expense.status, action, user.role, { amount: expense.amount, threshold: company.approvalThreshold, workStatus: expense.milestone?.status });
  if (!result.ok) return { error: result.error };

  await db.expense.update({
    where: { id: expense.id },
    data: { status: result.next, reviewNote: note, decidedAt: result.next === "APPROVED" || result.next === "REJECTED" ? new Date() : null },
  });
  const money = formatMoney(expense.amount, company.currency);
  const label = `${money} from ${expense.vendor}`;
  await audit(
    user.id,
    result.next === "OWNER_REVIEW" ? `approved ${label} and sent it to the owner` : `${action === "approve" ? "approved" : "rejected"} ${label}`,
    "Expense",
    expense.id,
    project.id,
    note ? { note } : undefined,
  );

  const href = `/projects/${project.id}/budget`;
  if (result.next === "OWNER_REVIEW") {
    await notifyProjectRoles(project.id, ["OWNER"], { title: `Invoice approval needed: ${money}`, body: `This invoice is over your ${formatMoney(company.approvalThreshold, company.currency)} limit. ${user.name} has approved it.`, href });
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
      body: `${expense.vendor}${reference ? `, ref ${reference}` : ""}. ${full ? "This invoice is fully paid." : `Balance remaining: ${money(expense.amount - expense.retention - paidOf(expense) - amount!)}.`}`,
      href,
    });
  }
  refresh(project.id);
  return { success: "Saved." };
}
