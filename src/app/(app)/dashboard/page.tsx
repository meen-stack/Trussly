import Link from "next/link";
import type { Metadata } from "next";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { visibleProjectsWhere } from "@/lib/access";
import { loadProjectSummary, health } from "@/lib/project-data";
import { approvalCount } from "@/lib/queues";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { COMMITTED } from "@/lib/budget";
import { balanceOf, paidOf, paymentKey } from "@/lib/status";
import type { CurrentUser } from "@/lib/auth";
import { ButtonLink, Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui";
import { PaymentBadge, WorkBadge, WorkPaymentBadge } from "@/components/status";
import { ProjectCard } from "@/components/project-card";
import { format, startOfMonth, startOfWeek } from "date-fns";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const currency = user.company.currency;
  const projects = await db.project.findMany({
    where: visibleProjectsWhere(user),
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  const summaries = await Promise.all(projects.map((p) => loadProjectSummary(p.id)));
  const pending = await approvalCount(user);
  const activity = await db.auditEvent.findMany({
    where: { project: visibleProjectsWhere(user) },
    include: { actor: true, project: { select: { name: true, id: true } } },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  const budget = summaries.reduce((s, x) => s + x.budget.budgeted, 0);
  const spent = summaries.reduce((s, x) => s + x.budget.spent, 0);
  const atRisk = summaries.filter((s) => health(s).tone === "bad");
  const warnings = summaries.flatMap((s) => s.budget.warnings.map((w) => ({ ...w, project: s.project })));

  const firstName = user.name.split(" ")[0];
  return (
    <>
      <PageHeader
        title={`Good to see you, ${firstName}`}
        subtitle={`${user.company.name} · ${summaries.length} project${summaries.length === 1 ? "" : "s"}`}
        action={
          can.createProject(user.role) && (
            <ButtonLink href="/projects/new">
              <Plus className="h-4 w-4" /> New project
            </ButtonLink>
          )
        }
      />

      {summaries.length === 0 ? (
        <Card>
          <EmptyState
            title="No projects yet"
            body={
              can.createProject(user.role)
                ? "Create your first project to start tracking reports, milestones and spend."
                : "You'll see projects here once a manager adds you."
            }
            action={can.createProject(user.role) && <ButtonLink href="/projects/new">Create a project</ButtonLink>}
          />
        </Card>
      ) : (
        <>
          {user.role === "SUPERVISOR" || user.role === "CONTRACTOR" || user.role === "FINANCE" ? (
            <RolePanel user={user} projectIds={projects.map((p) => p.id)} />
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Total budget" value={formatMoney(budget, currency, true)} sub={`${summaries.length} active sites`} />
              <Stat label="Approved spend" value={formatMoney(spent, currency, true)} sub={`${budget ? Math.round((spent / budget) * 100) : 0}% of budget`} />
              <Stat
                label="Waiting on you"
                value={pending}
                sub={
                  <Link href="/approvals" className="text-brand-text hover:underline">
                    Open approvals
                  </Link>
                }
                tone={pending ? "warn" : undefined}
              />
              <Stat
                label="Projects at risk"
                value={atRisk.length}
                sub={atRisk.length ? atRisk.map((s) => s.project.name).join(", ") : "All on track"}
                tone={atRisk.length ? "bad" : "ok"}
              />
            </div>
          )}

          {warnings.length > 0 && user.role !== "CONTRACTOR" && user.role !== "SUPERVISOR" && (
            <Card className="mt-6 border-warn/30 bg-warn/5">
              <div className="flex gap-3 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
                <div className="text-sm">
                  <p className="font-semibold">Budget lines need attention</p>
                  <ul className="mt-1 space-y-0.5 text-muted">
                    {warnings.map((w) => (
                      <li key={w.id}>
                        <Link href={`/projects/${w.project.id}/budget`} className="font-medium text-ink hover:text-brand-text">
                          {w.project.name}
                        </Link>
                        : {w.category} is at {Math.round(w.ratio * 100)}% ({formatMoney(w.spent, currency)} of {formatMoney(w.budgeted, currency)})
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
              {summaries.map((s) => (
                <ProjectCard key={s.project.id} s={s} currency={currency} />
              ))}
            </div>
            <Card className="self-start">
              <CardHeader title="Latest activity" />
              <ul className="divide-y divide-line">
                {activity.length === 0 && <li className="p-5 text-sm text-muted">Nothing yet.</li>}
                {activity.map((a) => (
                  <li key={a.id} className="px-5 py-3 text-sm">
                    <p>
                      <span className="font-medium">{a.actor.name}</span> {a.action}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {a.project?.name} · {formatDistanceToNow(a.createdAt, { addSuffix: true })}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

const DAY = 864e5;

/** Focused dashboards for the site supervisor, contractor and accountant. */
async function RolePanel({ user, projectIds }: { user: CurrentUser; projectIds: string[] }) {
  const currency = user.company.currency;
  const money = (c: number) => formatMoney(c, currency, true);
  const project = { id: { in: projectIds } };

  if (user.role === "SUPERVISOR") {
    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
    const [toInspect, reportedToday, incidents, sites] = await Promise.all([
      db.milestone.findMany({
        where: { status: "SUBMITTED", projectId: { in: projectIds } },
        include: { project: true, assignee: true },
        orderBy: { submittedAt: "asc" },
      }),
      db.dailyReport.findMany({
        where: { projectId: { in: projectIds }, date: today },
        select: { projectId: true },
      }),
      db.dailyReport.count({
        where: {
          projectId: { in: projectIds },
          incidents: { not: null },
          date: { gte: startOfWeek(today) },
        },
      }),
      db.project.findMany({ where: project, select: { id: true, name: true } }),
    ]);
    const missing = sites.filter((p) => !reportedToday.some((r) => r.projectId === p.id));
    return (
      <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Inspections waiting"
            value={toInspect.length}
            tone={toInspect.length ? "warn" : "ok"}
            sub={
              <Link href="/approvals" className="text-brand-text hover:underline">
                Open inspections
              </Link>
            }
          />
          <Stat label="Reports due today" value={missing.length} tone={missing.length ? "warn" : "ok"} sub={missing.length ? "Due by 6 PM" : "All filed"} />
          <Stat label="Incidents this week" value={incidents} tone={incidents ? "bad" : "ok"} />
          <Stat label="Your sites" value={sites.length} />
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Work to inspect" />
            <ul className="divide-y divide-line">
              {toInspect.length === 0 && <li className="p-5 text-sm text-muted">Nothing waiting for inspection.</li>}
              {toInspect.map((m) => (
                <li key={m.id}>
                  <Link href={`/projects/${m.projectId}/milestones`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-bg">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{m.title}</p>
                      <p className="text-xs text-muted">
                        {m.project.name} · {m.assignee?.name ?? "Contractor"}
                        {m.submittedAt && ` · submitted ${format(m.submittedAt, "MMM d")}`}
                      </p>
                    </div>
                    <WorkBadge status={m.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Today's site reports" />
            <ul className="divide-y divide-line">
              {sites.map((p) => {
                const done = !missing.includes(p);
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="font-medium">{p.name}</span>
                    {done ? (
                      <span className="text-xs text-ok">Filed</span>
                    ) : (
                      <ButtonLink href={`/projects/${p.id}/reports/new`} className="px-3 py-1.5 text-xs">
                        File report
                      </ButtonLink>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </>
    );
  }

  if (user.role === "CONTRACTOR") {
    const [work, invoices] = await Promise.all([
      db.milestone.findMany({
        where: { assigneeId: user.id, projectId: { in: projectIds } },
        include: { project: true, invoices: { include: { payments: true } } },
        orderBy: { dueDate: "asc" },
      }),
      db.expense.findMany({
        where: { submitterId: user.id },
        include: { payments: true, budgetLine: { include: { project: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const active = work.filter((m) => m.status !== "VERIFIED" && m.status !== "REJECTED");
    const corrections = work.filter((m) => m.status === "CORRECTIONS");
    const owed = invoices.filter((e) => COMMITTED.includes(e.status) && e.status !== "PAID").reduce((s, e) => s + Math.max(balanceOf(e), 0), 0);
    const paid = invoices.reduce((s, e) => s + paidOf(e), 0);
    const toInvoice = work.filter((m) => m.status === "VERIFIED" && m.invoices.filter((i) => !i.status.includes("REJECTED")).length === 0);
    return (
      <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Your active work"
            value={active.length}
            sub={toInvoice.length ? `${toInvoice.length} verified, ready to invoice` : `${work.length} items in total`}
          />
          <Stat
            label="Needs corrections"
            value={corrections.length}
            tone={corrections.length ? "bad" : "ok"}
            sub={corrections[0]?.title ?? "Nothing sent back"}
          />
          <Stat label="Owed to you" value={money(owed)} sub="Approved, not yet paid" />
          <Stat label="Paid to date" value={money(paid)} tone="ok" />
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Your work" />
            <ul className="divide-y divide-line">
              {work.length === 0 && <li className="p-5 text-sm text-muted">No work assigned yet.</li>}
              {work.map((m) => (
                <li key={m.id}>
                  <Link href={`/projects/${m.projectId}/milestones`} className="block px-5 py-3 text-sm hover:bg-bg">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{m.title}</p>
                        <p className="text-xs text-muted">
                          {m.project.name} · {formatMoney(m.paymentAmount, currency)} · due {format(m.dueDate, "MMM d")}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <WorkBadge status={m.status} invoices={m.invoices} />
                      <WorkPaymentBadge invoices={m.invoices} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Your invoices and payments" />
            <ul className="divide-y divide-line">
              {invoices.length === 0 && <li className="p-5 text-sm text-muted">No invoices yet.</li>}
              {invoices.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {formatMoney(e.amount, currency)} · {e.budgetLine.project.name}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {e.description}
                      {paidOf(e) > 0 && ` · paid ${formatMoney(paidOf(e), currency)}`}
                    </p>
                  </div>
                  <PaymentBadge invoice={e} />
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </>
    );
  }

  // FINANCE
  const invoices = await db.expense.findMany({
    where: { budgetLine: { projectId: { in: projectIds } } },
    include: { payments: true, budgetLine: { include: { project: true } } },
    orderBy: { dueDate: "asc" },
  });
  const now = new Date();
  const owing = invoices.filter((e) => e.status === "APPROVED" || e.status === "PROCESSING");
  const overdue = owing.filter((e) => paymentKey(e, now) === "OVERDUE");
  const dueSoon = owing.filter((e) => e.dueDate && e.dueDate >= now && e.dueDate.getTime() - now.getTime() < 7 * DAY);
  const paidMonth = invoices
    .flatMap((e) => e.payments)
    .filter((p) => p.paidAt >= startOfMonth(now))
    .reduce((s, p) => s + p.amount, 0);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Approved, unpaid"
          value={money(owing.reduce((s, e) => s + balanceOf(e), 0))}
          sub={
            <Link href="/finance" className="text-brand-text hover:underline">
              {owing.length} to pay
            </Link>
          }
        />
        <Stat
          label="Overdue"
          value={overdue.length}
          tone={overdue.length ? "bad" : "ok"}
          sub={overdue.length ? money(overdue.reduce((s, e) => s + balanceOf(e), 0)) : "Nothing overdue"}
        />
        <Stat
          label="Due in 7 days"
          value={dueSoon.length}
          tone={dueSoon.length ? "warn" : undefined}
          sub={money(dueSoon.reduce((s, e) => s + balanceOf(e), 0))}
        />
        <Stat label="Paid this month" value={money(paidMonth)} tone="ok" />
      </div>
      <Card className="mt-6">
        <CardHeader title="Payments to make" />
        <ul className="divide-y divide-line">
          {owing.length === 0 && <li className="p-5 text-sm text-muted">Nothing waiting for payment.</li>}
          {owing.slice(0, 6).map((e) => (
            <li key={e.id}>
              <Link href="/finance" className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-bg">
                <div className="min-w-0">
                  <p className="font-medium">
                    {formatMoney(balanceOf(e), currency)} · {e.vendor}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {e.budgetLine.project.name}
                    {e.dueDate && ` · due ${format(e.dueDate, "MMM d")}`}
                  </p>
                </div>
                <PaymentBadge invoice={e} />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
