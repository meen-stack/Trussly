import type { Metadata } from "next";
import { format } from "date-fns";
import { FileText } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getProjectForUser } from "@/lib/access";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { summarizeBudget } from "@/lib/budget";
import { nextExpenseStatus } from "@/lib/workflow";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Progress, Select, Stat } from "@/components/ui";
import { StatusBadge } from "@/components/status";
import { ActionForm } from "@/components/action-form";
import { submitExpense, decideExpense } from "@/app/actions/expenses";
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
    include: { budgetLine: true, submitter: true },
    orderBy: { createdAt: "desc" },
  });
  const b = summarizeBudget(lines);
  const manage = can.manageProject(user.role);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Budget" value={formatMoney(b.budgeted, currency)} />
        <Stat label="Approved spend" value={formatMoney(b.spent, currency)} sub={`${Math.round(b.ratio * 100)}% used`} tone={b.ratio > 1 ? "bad" : b.ratio >= 0.9 ? "warn" : undefined} />
        <Stat label="Awaiting approval" value={formatMoney(b.pending, currency)} />
        <Stat label="Remaining" value={formatMoney(b.budgeted - b.spent, currency)} tone={b.budgeted - b.spent < 0 ? "bad" : undefined} />
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
            <CardHeader title="Submit an invoice" subtitle={`Over ${formatMoney(threshold, currency)} also needs the owner's approval.`} />
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
        <CardHeader title="Invoices" />
        {expenses.length === 0 ? (
          <EmptyState title="No invoices yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-bg text-left text-xs text-muted uppercase">
                <tr>
                  <th className="px-5 py-2 font-medium">Date</th>
                  <th className="px-5 py-2 font-medium">Vendor</th>
                  <th className="px-5 py-2 font-medium">Line</th>
                  <th className="px-5 py-2 text-right font-medium">Amount</th>
                  <th className="px-5 py-2 font-medium">Status</th>
                  <th className="px-5 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {expenses.map((e) => {
                  const canApprove = nextExpenseStatus(e.status, "approve", user.role, e.amount, threshold).ok;
                  return (
                    <tr key={e.id} className="align-top">
                      <td className="px-5 py-3 whitespace-nowrap text-muted">{format(e.createdAt, "MMM d")}</td>
                      <td className="px-5 py-3">
                        <p className="font-medium">{e.vendor}</p>
                        <p className="text-xs text-muted">
                          {e.description} · {e.submitter.name}
                        </p>
                        {e.reviewNote && <p className="mt-1 text-xs">Note: {e.reviewNote}</p>}
                      </td>
                      <td className="px-5 py-3 text-muted">{e.budgetLine.category}</td>
                      <td className="px-5 py-3 text-right font-medium whitespace-nowrap">{formatMoney(e.amount, currency)}</td>
                      <td className="px-5 py-3">
                        <StatusBadge status={e.status} />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {e.invoiceUrl && (
                            <a href={e.invoiceUrl} target="_blank" rel="noreferrer" className="text-muted hover:text-ink" title="View invoice">
                              <FileText className="h-4 w-4" />
                            </a>
                          )}
                          {canApprove && (
                            <form action={decideExpense.bind(null, project.id, e.id)} className="flex gap-1">
                              <Button name="decision" value="approve" variant="success" className="px-3 py-1 text-xs">
                                Approve
                              </Button>
                              <Button name="decision" value="reject" variant="danger" className="px-3 py-1 text-xs">
                                Reject
                              </Button>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
