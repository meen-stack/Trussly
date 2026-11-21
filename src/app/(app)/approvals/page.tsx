import Link from "next/link";
import type { Metadata } from "next";
import { format } from "date-fns";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { approvalWhere } from "@/lib/queues";
import { formatMoney } from "@/lib/money";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { StatusBadge, WorkBadge } from "@/components/status";
import { InvoiceTable, invoiceInclude } from "@/components/invoice-table";

export const metadata: Metadata = { title: "Approvals" };

const WORK_TITLE: Partial<Record<string, string>> = {
  SUPERVISOR: "Work to inspect",
  MANAGER: "Inspected work to approve",
  OWNER: "Work needing your final approval",
  CONTRACTOR: "Work sent back for corrections",
};

export default async function ApprovalsPage() {
  const user = await requireUser();
  const currency = user.company.currency;
  const w = approvalWhere(user);
  const [reports, milestones, expenses] = await Promise.all([
    w.reports ? db.dailyReport.findMany({ where: w.reports, include: { project: true, author: true }, orderBy: { date: "desc" } }) : [],
    w.milestones ? db.milestone.findMany({ where: w.milestones, include: { project: true, assignee: { select: { name: true } } }, orderBy: { dueDate: "asc" } }) : [],
    w.expenses ? db.expense.findMany({ where: w.expenses, include: invoiceInclude, orderBy: { createdAt: "asc" } }) : [],
  ]);
  const total = reports.length + milestones.length + expenses.length;
  const hasQueue = w.reports || w.milestones || w.expenses;

  return (
    <>
      <PageHeader title="Approvals" subtitle={hasQueue ? `${total} item${total === 1 ? "" : "s"} waiting on you` : "Nothing here needs your role. Items you submit show their status on each project."} />
      {hasQueue && total === 0 && (
        <Card>
          <EmptyState title="You're all caught up" body="New reports, work and invoices that need you will appear here." />
        </Card>
      )}
      <div className="space-y-6">
        {expenses.length > 0 && (
          <Card>
            <CardHeader title={user.role === "FINANCE" || user.role === "ADMIN" ? "Invoices to pay" : "Invoices to approve"} />
            <InvoiceTable rows={expenses} role={user.role} currency={currency} threshold={user.company.approvalThreshold} showProject />
          </Card>
        )}
        {milestones.length > 0 && (
          <Card>
            <CardHeader title={WORK_TITLE[user.role] ?? "Work"} />
            <ul className="divide-y divide-line">
              {milestones.map((m) => (
                <li key={m.id}>
                  <Link href={`/projects/${m.projectId}/milestones`} className="flex items-center gap-3 px-5 py-4 text-sm hover:bg-bg">
                    <div className="flex-1">
                      <p className="font-medium">{m.title}</p>
                      <p className="text-muted">
                        {m.project.name} · {formatMoney(m.paymentAmount, currency)}
                        {m.assignee && ` · ${m.assignee.name}`}
                      </p>
                    </div>
                    <WorkBadge status={m.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {reports.length > 0 && (
          <Card>
            <CardHeader title="Daily reports to review" />
            <ul className="divide-y divide-line">
              {reports.map((r) => (
                <li key={r.id}>
                  <Link href={`/projects/${r.projectId}/reports/${r.id}`} className="flex items-center gap-3 px-5 py-4 text-sm hover:bg-bg">
                    <div className="flex-1">
                      <p className="font-medium">
                        {r.project.name} · {format(r.date, "EEE, MMM d")}
                      </p>
                      <p className="text-muted">
                        {r.author.name}
                        {r.issues && <span className="ml-2 font-medium text-bad">Issue flagged</span>}
                      </p>
                    </div>
                    <StatusBadge status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
