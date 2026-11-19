import { describe, expect, it } from "vitest";
import { nextExpenseStatus, nextMilestoneStatus } from "@/lib/workflow";

describe("milestone workflow", () => {
  it("runs contractor submit, manager pass, owner sign-off", () => {
    expect(nextMilestoneStatus("OPEN", "submit", "CONTRACTOR")).toEqual({ ok: true, next: "SUBMITTED" });
    expect(nextMilestoneStatus("SUBMITTED", "pass", "MANAGER")).toEqual({ ok: true, next: "PASSED" });
    expect(nextMilestoneStatus("PASSED", "signOff", "OWNER")).toEqual({ ok: true, next: "SIGNED_OFF" });
  });

  it("blocks skipping inspection and wrong roles", () => {
    expect(nextMilestoneStatus("SUBMITTED", "signOff", "OWNER").ok).toBe(false);
    expect(nextMilestoneStatus("SUBMITTED", "pass", "CONTRACTOR").ok).toBe(false);
    expect(nextMilestoneStatus("OPEN", "pass", "MANAGER").ok).toBe(false);
  });

  it("lets rejected work be resubmitted", () => {
    expect(nextMilestoneStatus("SUBMITTED", "reject", "MANAGER")).toEqual({ ok: true, next: "REJECTED" });
    expect(nextMilestoneStatus("REJECTED", "submit", "CONTRACTOR")).toEqual({ ok: true, next: "SUBMITTED" });
  });
});

describe("expense workflow", () => {
  const threshold = 10_000;

  it("approves small spend with the manager alone", () => {
    expect(nextExpenseStatus("PENDING", "approve", "MANAGER", 5_000, threshold)).toEqual({ ok: true, next: "APPROVED" });
  });

  it("routes large spend to the owner", () => {
    expect(nextExpenseStatus("PENDING", "approve", "MANAGER", 50_000, threshold)).toEqual({ ok: true, next: "MANAGER_APPROVED" });
    expect(nextExpenseStatus("MANAGER_APPROVED", "approve", "MANAGER", 50_000, threshold).ok).toBe(false);
    expect(nextExpenseStatus("MANAGER_APPROVED", "approve", "OWNER", 50_000, threshold)).toEqual({ ok: true, next: "APPROVED" });
  });

  it("does not let the owner skip the manager or change a decision", () => {
    expect(nextExpenseStatus("PENDING", "approve", "OWNER", 50_000, threshold).ok).toBe(false);
    expect(nextExpenseStatus("APPROVED", "reject", "OWNER", 50_000, threshold).ok).toBe(false);
  });
});
