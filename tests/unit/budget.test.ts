import { describe, expect, it } from "vitest";
import { forecastFinalCost, plannedProgress, summarizeBudget, summarizeLine } from "@/lib/budget";

const line = (budgeted: number, expenses: [number, string][]) => ({
  id: "l",
  category: "Concrete",
  budgeted,
  expenses: expenses.map(([amount, status]) => ({ amount, status })),
});

describe("summarizeLine", () => {
  it("counts only approved spend and tracks pending separately", () => {
    const s = summarizeLine(line(1000, [[300, "APPROVED"], [200, "PENDING"], [100, "MANAGER_APPROVED"], [999, "REJECTED"]]));
    expect(s.spent).toBe(300);
    expect(s.pending).toBe(300);
    expect(s.state).toBe("ok");
  });

  it("warns at 90% and flags over budget above 100%", () => {
    expect(summarizeLine(line(1000, [[900, "APPROVED"]])).state).toBe("warning");
    expect(summarizeLine(line(1000, [[1001, "APPROVED"]])).state).toBe("over");
  });

  it("treats spend against a zero budget as over", () => {
    expect(summarizeLine(line(0, [[1, "APPROVED"]])).state).toBe("over");
  });
});

describe("summarizeBudget", () => {
  it("totals lines and lists warnings", () => {
    const s = summarizeBudget([line(1000, [[950, "APPROVED"]]), line(2000, [[100, "APPROVED"]])]);
    expect(s.budgeted).toBe(3000);
    expect(s.spent).toBe(1050);
    expect(s.warnings).toHaveLength(1);
  });
});

describe("forecastFinalCost", () => {
  it("projects final cost from progress", () => {
    expect(forecastFinalCost(50_000, 25)).toBe(200_000);
  });
  it("refuses to project from very early progress", () => {
    expect(forecastFinalCost(50_000, 10)).toBeNull();
  });
});

describe("plannedProgress", () => {
  it("is linear between start and end and clamps", () => {
    const start = new Date("2026-01-01");
    const end = new Date("2026-01-11");
    expect(plannedProgress(start, end, new Date("2026-01-06"))).toBe(50);
    expect(plannedProgress(start, end, new Date("2025-12-01"))).toBe(0);
    expect(plannedProgress(start, end, new Date("2027-01-01"))).toBe(100);
  });
});
