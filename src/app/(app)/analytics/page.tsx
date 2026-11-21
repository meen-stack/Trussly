import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Star } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { visibleProjectsWhere } from "@/lib/access";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { COMMITTED, IN_REVIEW } from "@/lib/budget";
import { byMonth, forecastLine, openOrderValue, originalBudget, paymentCycleDays, poTotal, scorecard } from "@/lib/commercial";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Progress, Stat, cn } from "@/components/ui";
import { MonthlyChart, VarianceChart } from "@/components/charts";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  const user = await requireUser();
  if (!can.seeAnalytics(user.role)) notFound();
  const currency = user.company.currency;
  const projects = await db.project.findMany({
    where: visibleProjectsWhere(user),
    include: {
      budgetLines: { include: { expenses: { include: { payments: true } }, changeOrders: true, purchases: { where: { status: { not: "CANCELLED" } }, include: { items: true, invoices: true } } } },
      milestones: { include: { assignee: { select: { id: true, name: true } } } },
      disputes: { select: { status: true } },
      ratings: { include: { contractor: { select: { id: true, name: true, title: true } } } },
    },
    orderBy: { name: "asc" },
  });

  const rows = projects.map((p) => {
    const lines = p.budgetLines;
    const expenses = lines.flatMap((l) => l.expenses);
    const budget = lines.reduce((s, l) => s + l.budgeted, 0);
    const original = lines.reduce((s, l) => s + originalBudget(l.budgeted, l.changeOrders), 0);
    const committed = expenses.filter((e) => COMMITTED.includes(e.status)).reduce((s, e) => s + e.amount, 0);
    // Forecast line by line, so an overrun on one line isn't hidden by headroom on another.
    const perLine = lines.map((l) =>
      forecastLine({
        revised: l.budgeted,
        committed: l.expenses.filter((e) => COMMITTED.includes(e.status)).reduce((s, e) => s + e.amount, 0),
        inReview: l.expenses.filter((e) => IN_REVIEW.includes(e.status)).reduce((s, e) => s + e.amount, 0),
        openOrders: l.purchases.reduce((s, po) => s + openOrderValue(poTotal(po.items), po.invoices.filter((i) => i.status !== "REJECTED").reduce((t, i) => t + i.amount, 0)), 0),
      }),
    );
    const forecast = perLine.reduce((s, f) => s + f.forecast, 0);
    const known = perLine.reduce((s, f) => s + f.known, 0);
    const f = { forecast, known, variance: budget - forecast, over: forecast > budget, overLines: perLine.filter((x) => x.over).length };
    const value = p.milestones.reduce((s, m) => s + m.paymentAmount, 0);
    const verified = p.milestones.filter((m) => m.status === "VERIFIED").reduce((s, m) => s + m.paymentAmount, 0);
    const paid = expenses.flatMap((e) => e.payments).reduce((s, x) => s + x.amount, 0);
    const changes = lines.flatMap((l) => l.changeOrders);
    return {
      p,
      budget,
      original,
      committed,
      paid,
      ...f,
      progress: value ? verified / value : 0,
      openDisputes: p.disputes.filter((d) => d.status !== "RESOLVED").length,
      changeNet: changes.filter((c) => c.status === "APPROVED").reduce((s, c) => s + c.amount, 0),
      changeCount: changes.length,
      changePending: changes.filter((c) => c.status === "PROPOSED").length,
    };
  });

  const allExpenses = projects.flatMap((p) => p.budgetLines.flatMap((l) => l.expenses));
  const monthly = (() => {
    const approved = byMonth(allExpenses.filter((e) => COMMITTED.includes(e.status) && e.decidedAt).map((e) => ({ at: e.decidedAt!, amount: e.amount })));
    const paid = byMonth(allExpenses.flatMap((e) => e.payments).map((x) => ({ at: x.paidAt, amount: x.amount })));
    const months = [...new Set([...approved, ...paid].map((r) => r.month))].sort().slice(-9);
    return months.map((month) => ({ month, approved: (approved.find((r) => r.month === month)?.amount ?? 0) / 100, paid: (paid.find((r) => r.month === month)?.amount ?? 0) / 100 }));
  })();
  const cycle = paymentCycleDays(allExpenses.filter((e) => e.status === "PAID"));

  // Contractor scorecards: ratings plus on-time delivery of verified work.
  const contractors = new Map<string, { name: string; title: string | null; ratings: { quality: number; timeliness: number; safety: number }[]; verified: number; onTime: number; projects: Set<string> }>();
  for (const p of projects) {
    for (const r of p.ratings) {
      const c = contractors.get(r.contractor.id) ?? { name: r.contractor.name, title: r.contractor.title, ratings: [], verified: 0, onTime: 0, projects: new Set() };
      c.ratings.push(r);
      c.projects.add(p.name);
      contractors.set(r.contractor.id, c);
    }
    for (const m of p.milestones) {
      if (!m.assignee || m.status !== "VERIFIED") continue;
      const c = contractors.get(m.assignee.id) ?? { name: m.assignee.name, title: null, ratings: [], verified: 0, onTime: 0, projects: new Set() };
      c.verified++;
      if (m.verifiedAt && m.verifiedAt <= m.dueDate) c.onTime++;
      c.projects.add(p.name);
      contractors.set(m.assignee.id, c);
    }
  }
  const cards = [...contractors.entries()].map(([id, c]) => ({ id, ...c, sc: scorecard(c.ratings) })).sort((a, b) => (b.sc?.overall ?? 0) - (a.sc?.overall ?? 0));

  const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
  const totalForecast = rows.reduce((s, r) => s + r.forecast, 0);

  return (
    <>
      <PageHeader title="Analytics" subtitle={`${projects.length} project${projects.length === 1 ? "" : "s"} across ${user.company.name}.`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Portfolio budget" value={formatMoney(totalBudget, currency, true)} sub={`${formatMoney(rows.reduce((s, r) => s + r.changeNet, 0), currency, true)} from change orders`} />
        <Stat label="Forecast final cost" value={formatMoney(totalForecast, currency, true)} sub={totalForecast > totalBudget ? `${formatMoney(totalForecast - totalBudget, currency, true)} over budget` : "On budget"} tone={totalForecast > totalBudget ? "bad" : "ok"} />
        <Stat label="Paid to date" value={formatMoney(rows.reduce((s, r) => s + r.paid, 0), currency, true)} />
        <Stat label="Approval to payment" value={cycle === null ? "–" : `${cycle.toFixed(1)} days`} sub="Average, fully paid invoices" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Spend by month" subtitle="Invoices approved against money paid out." />
          <div className="p-4">{monthly.length ? <MonthlyChart data={monthly} currency={currency} /> : <EmptyState title="No spend yet" />}</div>
        </Card>
        <Card>
          <CardHeader title="Cost variance" subtitle="Forecast is each line's budget, or its known cost where that is higher." />
          <div className="p-4">
            <VarianceChart data={rows.map((r) => ({ name: r.p.name, budget: r.budget / 100, forecast: r.forecast / 100, spent: r.known / 100 }))} currency={currency} />
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Projects" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-line">
                <th className="px-5 py-2 font-medium">Project</th>
                <th className="px-3 py-2 font-medium">Work verified</th>
                <th className="px-3 py-2 text-right font-medium">Budget</th>
                <th className="px-3 py-2 text-right font-medium">Forecast</th>
                <th className="px-3 py-2 text-right font-medium">Variance</th>
                <th className="px-3 py-2 text-right font-medium">Change orders</th>
                <th className="px-5 py-2 font-medium">Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.p.id}>
                  <td className="px-5 py-3">
                    <Link href={`/projects/${r.p.id}/budget`} className="font-medium hover:underline">{r.p.name}</Link>
                  </td>
                  <td className="w-40 px-3 py-3">
                    <Progress value={r.progress * 100} tone="ok" />
                    <span className="text-xs text-muted">{Math.round(r.progress * 100)}%</span>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">{formatMoney(r.budget, currency)}</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">{formatMoney(r.forecast, currency)}</td>
                  <td className={cn("px-3 py-3 text-right font-medium whitespace-nowrap", r.over ? "text-bad" : "text-ok")}>
                    {r.variance === 0 ? "On budget" : `${formatMoney(-r.variance, currency)} over`}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    {r.changeCount} <span className="text-xs text-muted">({r.changeNet >= 0 ? "+" : ""}{formatMoney(r.changeNet, currency, true)})</span>
                  </td>
                  <td className="space-x-1 px-5 py-3 whitespace-nowrap">
                    {r.overLines > 0 && <Badge tone="bad">{r.overLines} line{r.overLines === 1 ? "" : "s"} over</Badge>}
                    {r.openDisputes > 0 && <Badge tone="warn">{r.openDisputes} dispute{r.openDisputes === 1 ? "" : "s"}</Badge>}
                    {r.changePending > 0 && <Badge tone="brand">{r.changePending} change{r.changePending === 1 ? "" : "s"} pending</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Contractor scorecard" subtitle="Ratings on verified work (1 to 5) and how much work was verified by its deadline." />
        {cards.length === 0 ? (
          <EmptyState title="No contractor history yet" />
        ) : (
          <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => (
              <div key={c.id} className="bg-surface p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{c.name}</p>
                    <p className="truncate text-xs text-muted">{c.title ?? [...c.projects].join(", ")}</p>
                  </div>
                  {c.sc && (
                    <span className="flex items-center gap-1 font-display text-lg font-semibold">
                      <Star className="h-4 w-4 fill-brand text-brand" />
                      {c.sc.overall.toFixed(1)}
                    </span>
                  )}
                </div>
                {c.sc ? (
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    {(["quality", "timeliness", "safety"] as const).map((k) => (
                      <div key={k} className="rounded-lg bg-bg py-2">
                        <dt className="text-muted capitalize">{k}</dt>
                        <dd className="font-semibold">{c.sc![k].toFixed(1)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-3 text-xs text-muted">Not rated yet</p>
                )}
                <p className="mt-3 text-xs text-muted">
                  {c.verified ? `${c.onTime} of ${c.verified} verified on time` : "No verified work yet"}
                  {c.sc ? ` · ${c.sc.count} rating${c.sc.count === 1 ? "" : "s"}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
