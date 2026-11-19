/** Pure budget maths. Amounts are integer cents. */

export type LineInput = {
  id: string;
  category: string;
  budgeted: number;
  expenses: { amount: number; status: string }[];
};

export const WARN_AT = 0.9;

export type LineSummary = {
  id: string;
  category: string;
  budgeted: number;
  spent: number;
  pending: number;
  ratio: number;
  state: "ok" | "warning" | "over";
};

export function summarizeLine(line: LineInput): LineSummary {
  const spent = line.expenses.filter((e) => e.status === "APPROVED").reduce((s, e) => s + e.amount, 0);
  const pending = line.expenses
    .filter((e) => e.status === "PENDING" || e.status === "MANAGER_APPROVED")
    .reduce((s, e) => s + e.amount, 0);
  const ratio = line.budgeted > 0 ? spent / line.budgeted : spent > 0 ? Infinity : 0;
  const state = ratio > 1 ? "over" : ratio >= WARN_AT ? "warning" : "ok";
  return { id: line.id, category: line.category, budgeted: line.budgeted, spent, pending, ratio, state };
}

export function summarizeBudget(lines: LineInput[]) {
  const summaries = lines.map(summarizeLine);
  const budgeted = summaries.reduce((s, l) => s + l.budgeted, 0);
  const spent = summaries.reduce((s, l) => s + l.spent, 0);
  const pending = summaries.reduce((s, l) => s + l.pending, 0);
  return {
    lines: summaries,
    budgeted,
    spent,
    pending,
    ratio: budgeted > 0 ? spent / budgeted : 0,
    warnings: summaries.filter((l) => l.state !== "ok"),
  };
}

/**
 * Straight-line forecast of final cost: spend so far divided by share of work complete.
 * Returns null when progress is too low to project from.
 */
export function forecastFinalCost(spent: number, progressPercent: number) {
  if (progressPercent < 15) return null;
  return Math.round(spent / (progressPercent / 100));
}

/** Expected percent complete today if work were spread evenly between start and end. */
export function plannedProgress(start: Date, end: Date, today = new Date()) {
  const total = end.getTime() - start.getTime();
  if (total <= 0) return 100;
  const elapsed = Math.min(Math.max(today.getTime() - start.getTime(), 0), total);
  return Math.round((elapsed / total) * 100);
}
