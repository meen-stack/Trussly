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
import { ButtonLink, Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui";
import { ProjectCard } from "@/components/project-card";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const currency = user.company.currency;
  const projects = await db.project.findMany({ where: visibleProjectsWhere(user), orderBy: { createdAt: "desc" }, select: { id: true } });
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
            body={can.createProject(user.role) ? "Create your first project to start tracking reports, milestones and spend." : "You'll see projects here once a manager adds you."}
            action={can.createProject(user.role) && <ButtonLink href="/projects/new">Create a project</ButtonLink>}
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Total budget" value={formatMoney(budget, currency, true)} sub={`${summaries.length} active sites`} />
            <Stat label="Approved spend" value={formatMoney(spent, currency, true)} sub={`${budget ? Math.round((spent / budget) * 100) : 0}% of budget`} />
            <Stat label="Waiting on you" value={pending} sub={<Link href="/approvals" className="text-brand hover:underline">Open approvals</Link>} tone={pending ? "warn" : undefined} />
            <Stat label="Projects at risk" value={atRisk.length} sub={atRisk.length ? atRisk.map((s) => s.project.name).join(", ") : "All on track"} tone={atRisk.length ? "bad" : "ok"} />
          </div>

          {warnings.length > 0 && (
            <Card className="mt-6 border-warn/30 bg-warn/5">
              <div className="flex gap-3 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
                <div className="text-sm">
                  <p className="font-semibold">Budget lines need attention</p>
                  <ul className="mt-1 space-y-0.5 text-muted">
                    {warnings.map((w) => (
                      <li key={w.id}>
                        <Link href={`/projects/${w.project.id}/budget`} className="font-medium text-ink hover:text-brand">
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
