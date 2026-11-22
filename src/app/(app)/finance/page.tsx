import Link from "next/link";
import type { Metadata } from "next";
import { format, startOfMonth } from "date-fns";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { visibleProjectsWhere } from "@/lib/access";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { COMMITTED } from "@/lib/budget";
import { balanceOf, paidOf, paymentKey } from "@/lib/status";
import { Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui";
import { InvoiceTable, invoiceInclude } from "@/components/invoice-table";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Finance" };

export default async function FinancePage() {
  const user = await requireUser();
  if (!can.seeFinance(user.role)) notFound();
  const { currency, approvalThreshold: threshold } = user.company;
  const project = visibleProjectsWhere(user);
  const [invoices, projects] = await Promise.all([
    db.expense.findMany({
      where: { budgetLine: { project } },
      include: invoiceInclude,
      orderBy: { dueDate: "asc" },
    }),
    db.project.findMany({
      where: project,
      include: { budgetLines: { select: { budgeted: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  const today = new Date();
  const owing = invoices.filter((e) => e.status === "APPROVED" || e.status === "PROCESSING");
  const overdue = owing.filter((e) => paymentKey(e, today) === "OVERDUE");
  const outstanding = owing.reduce((s, e) => s + balanceOf(e), 0);
  const payments = invoices.flatMap((e) => e.payments.map((p) => ({ ...p, invoice: e }))).sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());
  const paidThisMonth = payments.filter((p) => p.paidAt >= startOfMonth(today)).reduce((s, p) => s + p.amount, 0);
  const retention = invoices.filter((e) => COMMITTED.includes(e.status) && !e.retentionReleasedAt).reduce((s, e) => s + e.retention, 0);
  const inReview = invoices.filter((e) => e.status === "SUBMITTED" || e.status === "OWNER_REVIEW");
  const refused = invoices.filter((e) => e.status === "PAYMENT_REJECTED");

  const report = projects.map((p) => {
    const mine = invoices.filter((e) => e.budgetLine.projectId === p.id);
    const committed = mine.filter((e) => COMMITTED.includes(e.status));
    return {
      p,
      budget: p.budgetLines.reduce((s, l) => s + l.budgeted, 0),
      committed: committed.reduce((s, e) => s + e.amount, 0),
      paid: mine.reduce((s, e) => s + paidOf(e), 0),
      outstanding: committed.filter((e) => e.status !== "PAID").reduce((s, e) => s + Math.max(balanceOf(e), 0), 0),
      retention: committed.filter((e) => !e.retentionReleasedAt).reduce((s, e) => s + e.retention, 0),
    };
  });
  const money = (c: number) => formatMoney(c, currency);

  return (
    <>
      <PageHeader title="Finance" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Approved, unpaid"
          value={formatMoney(outstanding, currency, true)}
          sub={`${owing.length} invoice${owing.length === 1 ? "" : "s"} to pay`}
        />
        <Stat
          label="Overdue"
          value={overdue.length}
          sub={overdue.length ? money(overdue.reduce((s, e) => s + balanceOf(e), 0)) : "Nothing overdue"}
          tone={overdue.length ? "bad" : "ok"}
        />
        <Stat label="Paid this month" value={formatMoney(paidThisMonth, currency, true)} sub={`${payments.length} payments recorded in total`} />
        <Stat
          label="Retention held"
          value={formatMoney(retention, currency, true)}
          sub={`${inReview.length} invoice${inReview.length === 1 ? "" : "s"} still in review`}
        />
      </div>

      <Card className="mt-6">
        <CardHeader title="To pay" />
        <InvoiceTable rows={owing} role={user.role} currency={currency} threshold={threshold} showProject />
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Payment history" />
          {payments.length === 0 ? (
            <EmptyState title="No payments yet" />
          ) : (
            <ul className="divide-y divide-line">
              {payments.slice(0, 12).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.invoice.vendor}</p>
                    <p className="truncate text-xs text-muted">
                      {p.invoice.budgetLine.project.name} · {format(p.paidAt, "MMM d, yyyy")}
                      {p.reference && ` · ${p.reference}`}
                    </p>
                  </div>
                  <span className="font-semibold whitespace-nowrap">{money(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Financial report" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-bg text-left text-xs text-muted uppercase">
                <tr>
                  <th className="px-5 py-2 font-medium">Project</th>
                  <th className="px-3 py-2 text-right font-medium">Budget</th>
                  <th className="px-3 py-2 text-right font-medium">Committed</th>
                  <th className="px-3 py-2 text-right font-medium">Paid</th>
                  <th className="px-5 py-2 text-right font-medium">Owed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {report.map((r) => (
                  <tr key={r.p.id}>
                    <td className="px-5 py-3">
                      <Link href={`/projects/${r.p.id}/budget`} className="font-medium hover:underline">
                        {r.p.name}
                      </Link>
                      <p className="text-xs text-muted">Retention {money(r.retention)}</p>
                    </td>
                    <td className="px-3 py-3 text-right">{formatMoney(r.budget, currency, true)}</td>
                    <td className={`px-3 py-3 text-right ${r.committed > r.budget ? "font-medium text-bad" : ""}`}>
                      {formatMoney(r.committed, currency, true)}
                    </td>
                    <td className="px-3 py-3 text-right">{formatMoney(r.paid, currency, true)}</td>
                    <td className="px-5 py-3 text-right font-medium">{formatMoney(r.outstanding, currency, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {refused.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Refused payments" />
          <InvoiceTable rows={refused} role={user.role} currency={currency} threshold={threshold} showProject />
        </Card>
      )}
    </>
  );
}
