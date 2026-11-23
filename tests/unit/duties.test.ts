import { describe, expect, it } from "vitest";
import { invoiceRoom, separationError, workOptions } from "@/lib/workflow";
import { disputeAction, reopenAfterDispute } from "@/lib/commercial";
import { auditScope, disputeScope, invoiceScope, type Viewer } from "@/lib/scope";
import { afterFailedLogin, lockedFor, MAX_FAILED_LOGINS } from "@/lib/lockout";

const as = (role: Viewer["role"]): Viewer => ({ id: "u1", companyId: "c1", role });

describe("separation of duties on work", () => {
  it("stops whoever submitted work from inspecting it", () => {
    expect(separationError("SUBMITTED", "pass", "m1", { submittedById: "m1" })).toMatch(/someone else must inspect/);
    expect(separationError("SUBMITTED", "fail", "m1", { submittedById: "m1" })).toMatch(/someone else must inspect/);
    expect(separationError("SUBMITTED", "pass", "s1", { submittedById: "m1" })).toBeNull();
  });
  it("stops whoever submitted or inspected work from approving it", () => {
    expect(separationError("INSPECTED", "approve", "m1", { submittedById: "m1", inspectedById: "s1" })).toMatch(/You submitted/);
    expect(separationError("INSPECTED", "approve", "m1", { submittedById: "c1", inspectedById: "m1" })).toMatch(/You inspected/);
    expect(separationError("INSPECTED", "reject", "m1", { submittedById: "c1", inspectedById: "m1" })).toMatch(/You inspected/);
    expect(separationError("INSPECTED", "approve", "m2", { submittedById: "c1", inspectedById: "s1" })).toBeNull();
  });
  it("stops the manager who approved from also giving the owner's final approval", () => {
    expect(separationError("AWAITING_OWNER", "finalApprove", "m1", { submittedById: "c1", inspectedById: "s1", approvedById: "m1" })).toMatch(/owner must give/);
    expect(separationError("AWAITING_OWNER", "finalApprove", "o1", { submittedById: "c1", inspectedById: "s1", approvedById: "m1" })).toBeNull();
  });
  it("hides the buttons a manager can't use on their own submission", () => {
    expect(workOptions("SUBMITTED", "MANAGER", 100, 1000, "m1", { submittedById: "m1" })).toEqual([]);
    expect(workOptions("SUBMITTED", "MANAGER", 100, 1000, "m2", { submittedById: "m1" })).toEqual(["pass", "fail"]);
  });
  it("keeps the old behaviour when no person is given", () => {
    expect(workOptions("INSPECTED", "MANAGER", 100, 1000)).toEqual(["approve", "return", "reject"]);
  });
});

describe("invoicing against work", () => {
  it("allows instalments up to the value of the work", () => {
    expect(invoiceRoom(10000, [])).toBe(10000);
    expect(invoiceRoom(10000, [{ amount: 3000, status: "PAID" }, { amount: 2000, status: "SUBMITTED" }])).toBe(5000);
  });
  it("frees up rejected invoices", () => {
    expect(invoiceRoom(10000, [{ amount: 10000, status: "REJECTED" }, { amount: 4000, status: "PAYMENT_REJECTED" }])).toBe(10000);
  });
  it("never goes below zero", () => {
    expect(invoiceRoom(10000, [{ amount: 12000, status: "APPROVED" }])).toBe(0);
  });
});

describe("disputes", () => {
  it("makes the person who made the decision escalate instead of settling it", () => {
    expect(disputeAction("OPEN", "resolve", "MANAGER", true).ok).toBe(false);
    expect(disputeAction("OPEN", "escalate", "MANAGER", true).ok).toBe(true);
    expect(disputeAction("OPEN", "resolve", "MANAGER", false).ok).toBe(true);
    expect(disputeAction("ESCALATED", "resolve", "OWNER", true).ok).toBe(true);
  });
  it("reopens rejected work and invoices", () => {
    expect(reopenAfterDispute({ work: { status: "REJECTED" } })).toEqual({ kind: "work", next: "CORRECTIONS" });
    expect(reopenAfterDispute({ invoice: { status: "REJECTED" } })).toEqual({ kind: "invoice", next: "SUBMITTED" });
    expect(reopenAfterDispute({ invoice: { status: "PAYMENT_REJECTED" } })).toEqual({ kind: "invoice", next: "APPROVED" });
    expect(reopenAfterDispute({ work: { status: "VERIFIED" } })).toBeNull();
    expect(reopenAfterDispute({})).toBeNull();
  });
});

describe("financial privacy", () => {
  it("limits contractors and supervisors to their own invoices", () => {
    expect(invoiceScope(as("CONTRACTOR"))).toEqual({ submitterId: "u1" });
    expect(invoiceScope(as("SUPERVISOR"))).toEqual({ submitterId: "u1" });
    for (const role of ["OWNER", "ADMIN", "MANAGER", "FINANCE"] as const) expect(invoiceScope(as(role))).toEqual({});
  });
  it("keeps supervisors out of disputes about other people's invoices", () => {
    expect(disputeScope(as("SUPERVISOR"))).toEqual({ OR: [{ expenseId: null }, { raisedById: "u1" }, { expense: { submitterId: "u1" } }] });
  });
  it("shows the whole audit trail only to the commercial side", () => {
    for (const role of ["OWNER", "ADMIN", "MANAGER", "FINANCE"] as const) expect(auditScope(as(role))).toEqual({});
  });
  it("shows supervisors site records and their own actions", () => {
    expect(auditScope(as("SUPERVISOR"))).toEqual({ OR: [{ actorId: "u1" }, { entityType: { in: ["Milestone", "DailyReport", "Material", "Document"] } }] });
  });
  it("shows contractors only what involves them", () => {
    const where = auditScope(as("CONTRACTOR"), { work: ["w1"], invoices: ["e1"], disputes: ["d1"] });
    expect(where.OR).toContainEqual({ actorId: "u1" });
    expect(where.OR).toContainEqual({ entityType: "Expense", entityId: { in: ["e1"] } });
    expect(where.OR).not.toContainEqual({ entityType: "Expense" });
    expect(where.OR).not.toContainEqual(expect.objectContaining({ entityType: "BudgetLine" }));
  });
});

describe("sign-in lockout", () => {
  const now = new Date("2026-11-23T12:00:00Z");
  it("counts misses and locks on the fifth", () => {
    let state = { failedLogins: 0, lockedUntil: null as Date | null };
    for (let i = 1; i < MAX_FAILED_LOGINS; i++) {
      state = afterFailedLogin(state.failedLogins, now);
      expect(state.lockedUntil).toBeNull();
    }
    state = afterFailedLogin(state.failedLogins, now);
    expect(state.lockedUntil).toEqual(new Date("2026-11-23T12:15:00Z"));
    expect(lockedFor(state.lockedUntil, now)).toBe(15);
  });
  it("unlocks once the time has passed", () => {
    expect(lockedFor(new Date("2026-11-23T11:59:00Z"), now)).toBe(0);
    expect(lockedFor(null, now)).toBe(0);
  });
});
