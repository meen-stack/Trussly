import { describe, expect, it } from "vitest";
import {
  blocksPayment,
  byMonth,
  canDecideChange,
  decideChange,
  disputeAction,
  forecastLine,
  fullySigned,
  initialPoStatus,
  missingSigners,
  nextVersion,
  openOrderValue,
  originalBudget,
  paymentCycleDays,
  poReceivedValue,
  poStatusAfterDelivery,
  poTotal,
  scorecard,
  stockOf,
  validScore,
} from "@/lib/commercial";

const T = 10_000;

describe("change orders", () => {
  it("lets the manager approve up to the limit and the owner above it", () => {
    expect(decideChange("PROPOSED", true, "MANAGER", 5_000, T)).toEqual({ ok: true, next: "APPROVED" });
    expect(decideChange("PROPOSED", true, "MANAGER", 50_000, T).ok).toBe(false);
    expect(decideChange("PROPOSED", true, "MANAGER", -50_000, T).ok).toBe(false);
    expect(decideChange("PROPOSED", true, "OWNER", 50_000, T)).toEqual({ ok: true, next: "APPROVED" });
    expect(decideChange("PROPOSED", false, "MANAGER", 50_000, T)).toEqual({ ok: true, next: "REJECTED" });
    expect(canDecideChange("MANAGER", 50_000, T)).toBe(false);
  });

  it("can't be decided twice or by a contractor", () => {
    expect(decideChange("APPROVED", true, "OWNER", 1, T).ok).toBe(false);
    expect(decideChange("PROPOSED", true, "CONTRACTOR", 1, T).ok).toBe(false);
  });

  it("recovers the original budget from approved changes", () => {
    expect(originalBudget(130, [{ amount: 50, status: "APPROVED" }, { amount: -20, status: "APPROVED" }, { amount: 999, status: "PROPOSED" }])).toBe(100);
  });
});

describe("purchase orders and stock", () => {
  const items = [
    { quantity: 10, unitPrice: 1_000, received: 4 },
    { quantity: 2, unitPrice: 5_000, received: 0 },
  ];
  it("totals orders and deliveries", () => {
    expect(poTotal(items)).toBe(20_000);
    expect(poReceivedValue(items)).toBe(4_000);
    expect(poReceivedValue([{ quantity: 1, unitPrice: 100, received: 3 }])).toBe(100);
  });
  it("sends big manager orders to the owner", () => {
    expect(initialPoStatus("MANAGER", 20_000, T)).toEqual({ ok: true, next: "PENDING_APPROVAL" });
    expect(initialPoStatus("MANAGER", 5_000, T)).toEqual({ ok: true, next: "ISSUED" });
    expect(initialPoStatus("OWNER", 20_000, T)).toEqual({ ok: true, next: "ISSUED" });
    expect(initialPoStatus("CONTRACTOR", 1, T).ok).toBe(false);
  });
  it("tracks delivery state", () => {
    expect(poStatusAfterDelivery(items)).toBe("PARTIALLY_RECEIVED");
    expect(poStatusAfterDelivery(items.map((i) => ({ ...i, received: i.quantity })))).toBe("RECEIVED");
    expect(poStatusAfterDelivery(items.map((i) => ({ ...i, received: 0 })))).toBe("ISSUED");
  });
  it("counts stock from movements", () => {
    expect(stockOf([{ kind: "RECEIVED", quantity: 10 }, { kind: "USED", quantity: 3 }, { kind: "ADJUSTED", quantity: 1 }])).toBe(8);
  });
});

describe("forecasting", () => {
  it("forecasts the revised budget unless known costs exceed it", () => {
    expect(forecastLine({ revised: 100, committed: 60, inReview: 20, openOrders: 30 })).toEqual({ known: 110, forecast: 110, variance: -10, over: true });
    expect(forecastLine({ revised: 100, committed: 50, inReview: 0, openOrders: 0 })).toEqual({ known: 50, forecast: 100, variance: 0, over: false });
    expect(openOrderValue(100, 30)).toBe(70);
    expect(openOrderValue(100, 130)).toBe(0);
  });
});

describe("ratings", () => {
  it("averages scores", () => {
    const s = scorecard([{ quality: 5, timeliness: 3, safety: 4 }, { quality: 3, timeliness: 5, safety: 4 }])!;
    expect(s.quality).toBe(4);
    expect(s.overall).toBe(4);
    expect(scorecard([])).toBeNull();
    expect(validScore(0)).toBe(false);
    expect(validScore(3.5)).toBe(false);
    expect(validScore(5)).toBe(true);
  });
});

describe("disputes", () => {
  it("is resolved by the manager, or by the owner once escalated", () => {
    expect(disputeAction("OPEN", "resolve", "MANAGER")).toEqual({ ok: true, next: "RESOLVED" });
    expect(disputeAction("OPEN", "escalate", "CONTRACTOR")).toEqual({ ok: true, next: "ESCALATED" });
    expect(disputeAction("ESCALATED", "resolve", "MANAGER").ok).toBe(false);
    expect(disputeAction("ESCALATED", "resolve", "OWNER")).toEqual({ ok: true, next: "RESOLVED" });
    expect(disputeAction("RESOLVED", "escalate", "MANAGER").ok).toBe(false);
  });
  it("holds payment while any dispute is unresolved", () => {
    expect(blocksPayment([{ status: "RESOLVED" }, { status: "ESCALATED" }])).toBe(true);
    expect(blocksPayment([{ status: "RESOLVED" }])).toBe(false);
  });
});

describe("documents", () => {
  it("knows who still has to sign", () => {
    expect(missingSigners(["OWNER", "CONTRACTOR"], [{ role: "OWNER" }])).toEqual(["CONTRACTOR"]);
    expect(fullySigned(["OWNER"], [{ role: "OWNER" }])).toBe(true);
    expect(fullySigned([], [])).toBe(false);
  });
  it("versions documents by title", () => {
    expect(nextVersion([{ title: "Drawings", version: 1 }, { title: "drawings ", version: 2 }], "Drawings")).toBe(3);
    expect(nextVersion([], "New")).toBe(1);
  });
});

describe("analytics", () => {
  it("measures approval to final payment", () => {
    const d = (s: string) => new Date(s);
    expect(paymentCycleDays([{ decidedAt: d("2026-01-01"), payments: [{ paidAt: d("2026-01-05") }, { paidAt: d("2026-01-11") }] }, { decidedAt: null, payments: [] }])).toBe(10);
    expect(paymentCycleDays([])).toBeNull();
  });
  it("groups by month", () => {
    expect(byMonth([{ at: new Date("2026-02-03"), amount: 1 }, { at: new Date("2026-01-09"), amount: 2 }, { at: new Date("2026-02-20"), amount: 3 }])).toEqual([
      { month: "2026-01", amount: 2 },
      { month: "2026-02", amount: 4 },
    ]);
  });
});
