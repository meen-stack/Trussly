"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getProjectForUser } from "@/lib/access";
import { can } from "@/lib/permissions";
import { formatMoney, parseMoney } from "@/lib/money";
import { nextExpenseStatus } from "@/lib/workflow";
import { summarizeLine, WARN_AT } from "@/lib/budget";
import { audit, notifyProjectRoles, notifyUsers } from "@/lib/notify";
import { filesFrom, storeFile } from "@/lib/storage";
import type { FormState } from "./auth";

export async function submitExpense(projectId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const project = await getProjectForUser(user, projectId);
  if (!can.submitExpense(user.role)) return { error: "Your role can't submit invoices." };
  const parsed = z
    .object({ budgetLineId: z.string().min(1, "Pick a budget line"), vendor: z.string().min(2, "Add the vendor"), description: z.string().min(2, "Describe the spend"), amount: z.string() })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const amount = parseMoney(parsed.data.amount);
  if (!amount) return { error: "Enter the amount as a number." };
  const line = await db.budgetLine.findFirst({ where: { id: parsed.data.budgetLineId, projectId: project.id } });
  if (!line) return { error: "Pick a budget line." };
  const invoice = filesFrom(form, "invoice")[0];
  let invoiceUrl: string | null = null;
  if (invoice) {
    try {
      invoiceUrl = await storeFile(invoice, `projects/${project.id}/invoices`);
    } catch (e) {
      return { error: (e as Error).message };
    }
  }
  const expense = await db.expense.create({
    data: { budgetLineId: line.id, submitterId: user.id, vendor: parsed.data.vendor, description: parsed.data.description, amount, invoiceUrl },
  });
  await audit(user.id, `submitted a ${formatMoney(amount)} invoice for ${line.category}`, "Expense", expense.id, project.id);
  await notifyProjectRoles(
    project.id,
    ["MANAGER"],
    { title: `Invoice to review: ${formatMoney(amount)}`, body: `${user.name} submitted ${parsed.data.vendor} for ${line.category} on ${project.name}.`, href: `/projects/${project.id}/budget` },
    user.id,
  );
  revalidatePath(`/projects/${project.id}`, "layout");
  return { success: "Invoice submitted for approval." };
}

export async function decideExpense(projectId: string, expenseId: string, form: FormData) {
  const user = await requireUser();
  const project = await getProjectForUser(user, projectId);
  const action = form.get("decision") === "approve" ? "approve" : "reject";
  const note = String(form.get("note") ?? "").trim() || null;
  const expense = await db.expense.findFirst({
    where: { id: expenseId, budgetLine: { projectId: project.id } },
    include: { budgetLine: true },
  });
  if (!expense) return;
  const company = await db.company.findUniqueOrThrow({ where: { id: project.companyId } });
  const result = nextExpenseStatus(expense.status, action, user.role, expense.amount, company.approvalThreshold);
  if (!result.ok) return;

  await db.expense.update({
    where: { id: expense.id },
    data: { status: result.next, reviewNote: note, decidedAt: result.next === "APPROVED" || result.next === "REJECTED" ? new Date() : null },
  });
  const label = `${formatMoney(expense.amount)} from ${expense.vendor}`;
  await audit(
    user.id,
    result.next === "MANAGER_APPROVED" ? `approved ${label} and sent it to the owner` : `${action === "approve" ? "approved" : "rejected"} ${label}`,
    "Expense",
    expense.id,
    project.id,
    note ? { note } : undefined,
  );

  const href = `/projects/${project.id}/budget`;
  if (result.next === "MANAGER_APPROVED") {
    await notifyProjectRoles(project.id, ["OWNER"], {
      title: `Approval needed: ${formatMoney(expense.amount)}`,
      body: `This invoice is over your ${formatMoney(company.approvalThreshold)} limit. ${user.name} has approved it.`,
      href,
    });
  } else {
    await notifyUsers([expense.submitterId], {
      title: `Invoice ${result.next === "APPROVED" ? "approved" : "rejected"}: ${formatMoney(expense.amount)}`,
      body: note ?? `${expense.vendor} for ${expense.budgetLine.category}.`,
      href,
    });
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
        body: `${project.name}: ${line.category} is at ${Math.round(after.ratio * 100)}% of its ${formatMoney(line.budgeted)} budget.`,
        href,
      });
    }
  }
  revalidatePath(`/projects/${project.id}`, "layout");
  revalidatePath("/approvals");
}
