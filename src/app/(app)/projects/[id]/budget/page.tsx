import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getProjectForUser } from "@/lib/access";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { summarizeBudget } from "@/lib/budget";
import { balanceOf, paidOf } from "@/lib/status";
import { Badge, Button, Card, CardHeader, Field, Input, Progress, Select, Stat } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { InvoiceTable, invoiceInclude } from "@/components/invoice-table";
import { submitExpense } from "@/app/actions/expenses";
import { addBudgetLine, updateBudgetLine } from "@/app/actions/projects";

export const metadata: Metadata = { title: "Budget & spend" };

export default async function BudgetPage({ params }: PageProps<"/projects/[id]/budget">) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProjectForUser(user, id);
  const currency = user.company.currency;
  const threshold = user.company.approvalThreshold;
  const lines = await db.budgetLine.findMany({ where: { projectId: project.id }, include: { expenses: true }, orderBy: { category: "asc" } });
  const expenses = await db.expense.findMany({
    where: { budgetLine: { projectId: project.id } },
    include: invoiceInclude,
    orderBy: { createdAt: "desc" },
  });
  const work = await db.milestone.findMany({
    where: { projectId: project.id, status: { not: "REJECTED" }, ...(user.role === "CONTRACTOR" && { OR: [{ assigneeId: user.id }, { assigneeId: null }] }) },
    orderBy: { sortOrder: "asc" },
  });
  const paid = expenses.reduce((s, e) => s + paidOf(e), 0);
  const owed = expenses.filter((e) => e.status === "APPROVED" || e.status === "PROCESSING").reduce((s, e) => s + balanceOf(e), 0);
  const b = summarizeBudget(lines);
  const manage = can.manageProject(user.role);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Budget" value={formatMoney(b.budgeted, currency)} />
        <Stat label="Approved spend" value={formatMoney(b.spent, currency)} sub={`${Math.round(b.ratio * 100)}% used`} tone={b.ratio > 1 ? "bad" : b.ratio >= 0.9 ? "warn" : undefined} />
        <Stat label="Paid" value={formatMoney(paid, currency)} sub={`${formatMoney(owed, currency)} approved, not yet paid`} />
        <Stat label="Remaining" value={formatMoney(b.budgeted - b.spent, currency)} sub={`${formatMoney(b.pending, currency)} in review`} tone={b.budgeted - b.spent < 0 ? "bad" : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Budget lines" subtitle="Lines turn amber at 90% and red over 100%." />
          <div className="divide-y divide-line">
            {b.lines.map((l) => (
              <div key={l.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium">{l.category}</span>
                  <span className="flex items-center gap-2">
                    {l.state !== "ok" && <Badge tone={l.state === "over" ? "bad" : "warn"}>{l.state === "over" ? "Over budget" : "Near limit"}</Badge>}
                    <span>
                      {formatMoney(l.spent, currency)} <span className="text-muted">/ {formatMoney(l.budgeted, currency)}</span>
                    </span>
                  </span>
                </div>
                <div className="mt-2">
                  <Progress value={l.ratio * 100} tone={l.state === "over" ? "bad" : l.state === "warning" ? "warn" : "ok"} />
                </div>
                {l.pending > 0 && <p className="mt-1 text-xs text-muted">{formatMoney(l.pending, currency)} awaiting approval</p>}
                {manage && (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-muted hover:text-ink">Adjust budget</summary>
                    <form action={updateBudgetLine.bind(null, project.id)} className="mt-2 flex gap-2">
                      <input type="hidden" name="id" value={l.id} />
                      <Input name="budgeted" defaultValue={(l.budgeted / 100).toFixed(0)} className="max-w-40" />
                      <Button variant="secondary">Save</Button>
                    </form>
                  </details>
                )}
              </div>
            ))}
          </div>
          {manage && (
            <div className="border-t border-line p-5">
              <ActionForm action={addBudgetLine.bind(null, project.id)} submitLabel="Add line" className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <Input name="category" placeholder="New category" required />
                <Input name="budgeted" placeholder="Amount" inputMode="decimal" required />
              </ActionForm>
            </div>
          )}
        </Card>

        {can.submitExpense(user.role) && (
          <Card className="self-start">
            <CardHeader title="Submit an invoice" subtitle={`Over ${formatMoney(threshold, currency)} also needs the owner's approval. ${user.company.retentionPercent}% is held on work invoices until handover.`} />
            <div className="p-5">
              <ActionForm action={submitExpense.bind(null, project.id)} submitLabel="Submit invoice">
                <Field label="Budget line">
                  <Select name="budgetLineId" required defaultValue="">
                    <option value="" disabled>
                      Choose…
                    </option>
                    {lines.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.category}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="For work" hint="Invoices for work can be approved once the work is verified.">
                  <Select name="milestoneId" defaultValue="">
                    <option value="">Not tied to work (materials, plant hire…)</option>
                    {work.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Vendor">
                  <Input name="vendor" placeholder="Apex Concrete Ltd" required />
                </Field>
                <Field label="What it covers">
                  <Input name="description" placeholder="Level 2 slab pour" required />
                </Field>
                <Field label={`Amount (${currency})`}>
                  <Input name="amount" inputMode="decimal" placeholder="18500" required />
                </Field>
                <Field label="Invoice" hint="PDF or photo, optional.">
                  <Input name="invoice" type="file" accept="image/*,application/pdf" />
                </Field>
              </ActionForm>
            </div>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader title="Invoices and payments" subtitle="Approval and payment are tracked separately from the work itself." />
        <InvoiceTable rows={expenses} role={user.role} currency={currency} threshold={threshold} />
      </Card>
    </div>
  );
}
