import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getProjectForUser } from "@/lib/access";
import { invoiceScope } from "@/lib/scope";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { summarizeBudget } from "@/lib/budget";
import { canReleaseRetention, forecastLine, openOrderValue, originalBudget, poTotal, retentionHeld } from "@/lib/commercial";
import { balanceOf, paidOf } from "@/lib/status";
import { Badge, Button, Card, CardHeader, Field, Input, Progress, Select, Stat } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { InvoiceTable, invoiceInclude } from "@/components/invoice-table";
import { releaseRetention, submitExpense } from "@/app/actions/expenses";
import { addBudgetLine, updateBudgetLine } from "@/app/actions/projects";

export const metadata: Metadata = { title: "Budget & spend" };

export default async function BudgetPage({ params }: PageProps<"/projects/[id]/budget">) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProjectForUser(user, id);
  const currency = user.company.currency;
  const threshold = user.company.approvalThreshold;
  const lines = await db.budgetLine.findMany({
    where: { projectId: project.id },
    include: {
      expenses: true,
      changeOrders: true,
      purchases: {
        where: { status: { not: "CANCELLED" } },
        include: { items: true, invoices: true },
      },
    },
    orderBy: { category: "asc" },
  });
  const expenses = await db.expense.findMany({
    where: { budgetLine: { projectId: project.id }, ...invoiceScope(user) },
    include: invoiceInclude,
    orderBy: { createdAt: "desc" },
  });
  const work = await db.milestone.findMany({
    where: {
      projectId: project.id,
      status: { not: "REJECTED" },
      ...(user.role === "CONTRACTOR" && {
        OR: [{ assigneeId: user.id }, { assigneeId: null }],
      }),
    },
    orderBy: { sortOrder: "asc" },
  });
  const paid = expenses.reduce((s, e) => s + paidOf(e), 0);
  const owed = expenses.filter((e) => e.status === "APPROVED" || e.status === "PROCESSING").reduce((s, e) => s + balanceOf(e), 0);
  const b = summarizeBudget(lines);
  // Forecast: approved spend + invoices in review + orders placed but not yet invoiced.
  const forecasts = new Map(
    lines.map((l) => {
      const sum = b.lines.find((x) => x.id === l.id)!;
      const openOrders = l.purchases.reduce(
        (s, po) =>
          s +
          openOrderValue(
            poTotal(po.items),
            po.invoices.filter((i) => i.status !== "REJECTED").reduce((t, i) => t + i.amount, 0),
          ),
        0,
      );
      return [
        l.id,
        {
          ...forecastLine({
            revised: l.budgeted,
            committed: sum.spent,
            inReview: sum.pending,
            openOrders,
          }),
          openOrders,
          original: originalBudget(l.budgeted, l.changeOrders),
        },
      ];
    }),
  );
  const forecastTotal = [...forecasts.values()].reduce((s, f) => s + f.forecast, 0);
  const originalTotal = [...forecasts.values()].reduce((s, f) => s + f.original, 0);
  const manage = can.manageProject(user.role);
  const held = retentionHeld(expenses);
  const heldTotal = held.reduce((s, e) => s + e.retention, 0);
  const released = expenses.filter((e) => e.retentionReleasedAt).reduce((s, e) => s + e.retention, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Revised budget"
          value={formatMoney(b.budgeted, currency)}
          sub={b.budgeted !== originalTotal ? `${formatMoney(originalTotal, currency)} original` : "No approved changes"}
        />
        <Stat
          label="Approved spend"
          value={formatMoney(b.spent, currency)}
          sub={`${Math.round(b.ratio * 100)}% used`}
          tone={b.ratio > 1 ? "bad" : b.ratio >= 0.9 ? "warn" : undefined}
        />
        <Stat label="Paid" value={formatMoney(paid, currency)} sub={`${formatMoney(owed, currency)} approved, not yet paid`} />
        <Stat
          label="Forecast final cost"
          value={formatMoney(forecastTotal, currency)}
          sub={forecastTotal > b.budgeted ? `${formatMoney(forecastTotal - b.budgeted, currency)} over budget` : "On budget"}
          tone={forecastTotal > b.budgeted ? "bad" : "ok"}
        />
      </div>

      {(heldTotal > 0 || released > 0) && (
        <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display font-semibold">Retention</p>
            <p className="text-sm text-muted">
              {heldTotal > 0
                ? `${formatMoney(heldTotal, currency)} held on ${held.length} invoice${held.length === 1 ? "" : "s"} until handover.`
                : "All retention has been released."}
              {released > 0 && ` ${formatMoney(released, currency)} released at handover.`}
            </p>
          </div>
          {heldTotal > 0 && canReleaseRetention(user.role, project.status) && (
            <ActionForm
              action={releaseRetention.bind(null, project.id)}
              submitLabel={`Release ${formatMoney(heldTotal, currency)}`}
              className="flex flex-col gap-2 sm:items-end"
            >
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="confirm" className="accent-[#ffc107]" /> The project is handed over
              </label>
            </ActionForm>
          )}
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Budget lines" />
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
                {(() => {
                  const f = forecasts.get(l.id)!;
                  return (
                    <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
                      {l.pending > 0 && <span>{formatMoney(l.pending, currency)} in review</span>}
                      {f.openOrders > 0 && <span>{formatMoney(f.openOrders, currency)} on order</span>}
                      {f.original !== l.budgeted && <span>{formatMoney(l.budgeted - f.original, currency)} from change orders</span>}
                      {f.known !== l.spent && (
                        <span className={f.over ? "font-medium text-bad" : ""}>
                          Known cost {formatMoney(f.known, currency)}
                          {f.over ? `, forecast ${formatMoney(-f.variance, currency)} over` : ""}
                        </span>
                      )}
                    </p>
                  );
                })()}
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
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 font-display font-semibold [&::-webkit-details-marker]:hidden">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-lg leading-none text-brand-ink transition-transform group-open:rotate-45">
                  +
                </span>
                Submit an invoice
              </summary>
              <div className="border-t border-line p-5">
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
                  <Field label="For work">
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
                  <Field label="Invoice">
                    <Input name="invoice" type="file" accept="image/*,application/pdf" />
                  </Field>
                </ActionForm>
              </div>
            </details>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader title="Invoices and payments" />
        <InvoiceTable rows={expenses} role={user.role} currency={currency} threshold={threshold} />
      </Card>
    </div>
  );
}
