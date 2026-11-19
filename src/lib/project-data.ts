import "server-only";
import { db } from "./db";
import { forecastFinalCost, plannedProgress, summarizeBudget } from "./budget";

/** Everything the project overview and dashboard need, computed in one place. */
export async function loadProjectSummary(projectId: string) {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      budgetLines: { include: { expenses: { select: { amount: true, status: true, decidedAt: true } } }, orderBy: { category: "asc" } },
      milestones: { orderBy: [{ sortOrder: "asc" }, { dueDate: "asc" }] },
      reports: { orderBy: { date: "asc" }, select: { date: true, progress: true, issues: true, status: true } },
    },
  });
  const budget = summarizeBudget(project.budgetLines);
  const latest = project.reports.at(-1);
  const progress = latest?.progress ?? 0;
  const planned = plannedProgress(project.startDate, project.endDate);
  const forecast = forecastFinalCost(budget.spent, progress);
  const signedOff = project.milestones.filter((m) => m.status === "SIGNED_OFF").length;
  const overdue = project.milestones.filter((m) => m.status !== "SIGNED_OFF" && m.dueDate < new Date());

  const progressSeries = project.reports.map((r) => ({
    t: r.date.getTime(),
    actual: r.progress,
    planned: plannedProgress(project.startDate, project.endDate, r.date),
  }));

  const approved = project.budgetLines
    .flatMap((l) => l.expenses)
    .filter((e) => e.status === "APPROVED" && e.decidedAt)
    .sort((a, b) => a.decidedAt!.getTime() - b.decidedAt!.getTime());
  let running = 0;
  const spendSeries = [{ t: project.startDate.getTime(), spent: 0 }].concat(
    approved.map((e) => ({ t: e.decidedAt!.getTime(), spent: (running += e.amount) / 100 })),
  );
  // Carry the current total through to today so the line ends at "now".
  if (Date.now() > project.startDate.getTime()) spendSeries.push({ t: Math.min(Date.now(), project.endDate.getTime()), spent: running / 100 });

  return {
    project,
    budget,
    progress,
    planned,
    behindBy: planned - progress,
    forecast,
    signedOff,
    overdue,
    latestReportDate: latest?.date ?? null,
    progressSeries,
    spendSeries,
    openIssues: project.reports.filter((r) => r.issues).length,
  };
}

export type ProjectSummary = Awaited<ReturnType<typeof loadProjectSummary>>;

/** Health rating used for the coloured status across the app. */
export function health(s: ProjectSummary): { tone: "ok" | "warn" | "bad"; label: string } {
  if (s.budget.lines.some((l) => l.state === "over") || s.behindBy > 15 || (s.forecast && s.forecast > s.budget.budgeted * 1.1)) {
    return { tone: "bad", label: "At risk" };
  }
  if (s.budget.warnings.length > 0 || s.behindBy > 5 || s.overdue.length > 0) return { tone: "warn", label: "Watch" };
  return { tone: "ok", label: "On track" };
}
