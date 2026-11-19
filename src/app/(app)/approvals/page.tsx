import Link from "next/link";
import type { Metadata } from "next";
import { format } from "date-fns";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { approvalWhere } from "@/lib/queues";
import { formatMoney } from "@/lib/money";
import { Button, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/status";
import { decideExpense } from "@/app/actions/expenses";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  const user = await requireUser();
  const currency = user.company.currency;
  const w = approvalWhere(user);
  const [reports, milestones, expenses] = await Promise.all([
    w.reports ? db.dailyReport.findMany({ where: w.reports, include: { project: true, author: true }, orderBy: { date: "desc" } }) : [],
    w.milestones ? db.milestone.findMany({ where: w.milestones, include: { project: true }, orderBy: { dueDate: "asc" } }) : [],
    w.expenses ? db.expense.findMany({ where: w.expenses, include: { budgetLine: { include: { project: true } }, submitter: true }, orderBy: { createdAt: "asc" } }) : [],
  ]);
  const total = reports.length + milestones.length + expenses.length;
  const hasQueue = w.reports || w.milestones || w.expenses;

  return (
    <>
      <PageHeader title="Approvals" subtitle={hasQueue ? `${total} item${total === 1 ? "" : "s"} waiting on you` : "Your role doesn't approve anything. Items you submit show their status on each project."} />
      {hasQueue && total === 0 && (
        <Card>
          <EmptyState title="You're all caught up" body="New reports, milestones and invoices that need you will appear here." />
        </Card>
      )}
      <div className="space-y-6">
        {expenses.length > 0 && (
          <Card>
            <CardHeader title="Invoices" />
            <ul className="divide-y divide-line">
              {expenses.map((e) => (
                <li key={e.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                  <div className="flex-1 text-sm">
                    <p className="font-medium">
                      {formatMoney(e.amount, currency)} · {e.vendor}
                    </p>
                    <p className="text-muted">
                      {e.budgetLine.project.name} · {e.budgetLine.category} · {e.description} · from {e.submitter.name}
                    </p>
                  </div>
                  <StatusBadge status={e.status} />
                  <form action={decideExpense.bind(null, e.budgetLine.projectId, e.id)} className="flex gap-2">
                    <Button name="decision" value="approve" variant="success" className="px-3 py-1.5">Approve</Button>
                    <Button name="decision" value="reject" variant="danger" className="px-3 py-1.5">Reject</Button>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {milestones.length > 0 && (
          <Card>
            <CardHeader title={user.role === "OWNER" ? "Milestones to sign off" : "Milestones to inspect"} />
            <ul className="divide-y divide-line">
              {milestones.map((m) => (
                <li key={m.id}>
                  <Link href={`/projects/${m.projectId}/milestones`} className="flex items-center gap-3 px-5 py-4 text-sm hover:bg-bg">
                    <div className="flex-1">
                      <p className="font-medium">{m.title}</p>
                      <p className="text-muted">
                        {m.project.name} · {formatMoney(m.paymentAmount, currency)} on sign-off
                      </p>
                    </div>
                    <StatusBadge status={m.status} />
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
