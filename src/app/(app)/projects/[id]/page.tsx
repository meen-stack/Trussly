import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getProjectForUser } from "@/lib/access";
import { db } from "@/lib/db";
import { health, loadProjectSummary } from "@/lib/project-data";
import { formatMoney } from "@/lib/money";
import { Badge, Card, CardHeader, EmptyState, Stat } from "@/components/ui";
import { StatusBadge } from "@/components/status";
import { BudgetChart, ProgressChart, SpendChart } from "@/components/charts";

export default async function ProjectOverview({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  await getProjectForUser(user, id);
  const s = await loadProjectSummary(id);
  const currency = user.company.currency;
  const h = health(s);
  const photos = await db.photo.findMany({
    where: { OR: [{ report: { projectId: id } }, { milestone: { projectId: id } }] },
    orderBy: { takenAt: "desc" },
    take: 6,
  });
  const nextMilestone = s.project.milestones.find((m) => m.status !== "SIGNED_OFF");
  const reportedToday = s.latestReportDate && format(s.latestReportDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Health" value={<Badge tone={h.tone}>{h.label}</Badge>} sub={s.behindBy > 0 ? `${s.behindBy} pts behind plan` : "At or ahead of plan"} />
        <Stat label="Progress" value={`${s.progress}%`} sub={`${s.planned}% planned by today`} tone={s.behindBy > 15 ? "bad" : s.behindBy > 5 ? "warn" : undefined} />
        <Stat
          label="Spent"
          value={formatMoney(s.budget.spent, currency, true)}
          sub={`${Math.round(s.budget.ratio * 100)}% of ${formatMoney(s.budget.budgeted, currency, true)}`}
          tone={s.budget.ratio > 1 ? "bad" : s.budget.ratio >= 0.9 ? "warn" : undefined}
        />
        <Stat
          label="Forecast final cost"
          value={s.forecast ? formatMoney(s.forecast, currency, true) : "—"}
          sub={s.forecast ? `${s.forecast > s.budget.budgeted ? "+" : ""}${formatMoney(s.forecast - s.budget.budgeted, currency, true)} vs budget` : "Needs more progress data"}
          tone={s.forecast && s.forecast > s.budget.budgeted * 1.1 ? "bad" : s.forecast && s.forecast > s.budget.budgeted ? "warn" : undefined}
        />
      </div>

      {!reportedToday && s.project.status === "ACTIVE" && (
        <Card className="flex items-center gap-3 border-warn/30 bg-warn/5 p-4 text-sm">
          <CalendarClock className="h-5 w-5 shrink-0 text-warn" />
          <p>
            No daily report yet today.{" "}
            {s.latestReportDate ? `Last one was ${formatDistanceToNow(s.latestReportDate, { addSuffix: true })}.` : "No reports have been filed."}
          </p>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Progress vs plan" subtitle="Site-reported completion against a straight-line schedule" />
          <div className="p-4">
            {s.progressSeries.length > 1 ? <ProgressChart data={s.progressSeries} /> : <EmptyState title="Not enough reports yet" body="The chart appears after two daily reports." />}
          </div>
        </Card>
        <Card>
          <CardHeader title="Approved spend over time" subtitle={`Budget ${formatMoney(s.budget.budgeted, currency)}`} />
          <div className="p-4">
            <SpendChart data={s.spendSeries} budget={s.budget.budgeted / 100} currency={currency} />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Budget vs actual by line" action={<Link href={`/projects/${id}/budget`} className="text-sm text-brand hover:underline">Details</Link>} />
          <div className="p-4">
            <BudgetChart currency={currency} data={s.budget.lines.map((l) => ({ category: l.category, budgeted: l.budgeted / 100, spent: l.spent / 100 }))} />
          </div>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Milestones" subtitle={`${s.signedOff} of ${s.project.milestones.length} signed off`} />
            <div className="p-5 text-sm">
              {nextMilestone ? (
                <>
                  <p className="text-muted">Next up</p>
                  <p className="mt-1 font-semibold">{nextMilestone.title}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <StatusBadge status={nextMilestone.status} />
                    <span className="text-muted">due {format(nextMilestone.dueDate, "MMM d")}</span>
                  </div>
                </>
              ) : (
                <p className="text-muted">All milestones signed off.</p>
              )}
              {s.overdue.length > 0 && (
                <p className="mt-4 flex items-center gap-2 text-bad">
                  <AlertTriangle className="h-4 w-4" /> {s.overdue.length} overdue
                </p>
              )}
              <Link href={`/projects/${id}/milestones`} className="mt-4 inline-block text-brand hover:underline">
                All milestones
              </Link>
            </div>
          </Card>
          <Card>
            <CardHeader title="Latest photos" action={<Link href={`/projects/${id}/photos`} className="text-sm text-brand hover:underline">All</Link>} />
            {photos.length ? (
              <div className="grid grid-cols-3 gap-1 p-2">
                {photos.map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={p.id} src={p.url} alt={p.caption ?? "Site photo"} className="aspect-square w-full rounded-md object-cover" />
                ))}
              </div>
            ) : (
              <EmptyState title="No photos yet" />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
