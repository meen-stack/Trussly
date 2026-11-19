import type { ExpenseStatus, MilestoneStatus, Role } from "@prisma/client";

/** Pure state machines for the approval workflows. Each returns the next status or an error. */

type Result<S> = { ok: true; next: S } | { ok: false; error: string };

export type MilestoneAction = "submit" | "pass" | "reject" | "signOff";

export function nextMilestoneStatus(current: MilestoneStatus, action: MilestoneAction, role: Role): Result<MilestoneStatus> {
  switch (action) {
    case "submit":
      if (role !== "CONTRACTOR" && role !== "MANAGER") return { ok: false, error: "Only contractors or managers can submit work." };
      if (current !== "OPEN" && current !== "REJECTED") return { ok: false, error: "This milestone is already submitted." };
      return { ok: true, next: "SUBMITTED" };
    case "pass":
      if (role !== "MANAGER") return { ok: false, error: "Only the project manager can inspect work." };
      if (current !== "SUBMITTED") return { ok: false, error: "Only submitted work can be passed." };
      return { ok: true, next: "PASSED" };
    case "reject":
      if (current === "SUBMITTED" && role === "MANAGER") return { ok: true, next: "REJECTED" };
      if (current === "PASSED" && role === "OWNER") return { ok: true, next: "REJECTED" };
      return { ok: false, error: "You can't reject this milestone at its current stage." };
    case "signOff":
      if (role !== "OWNER") return { ok: false, error: "Only the owner can give final sign-off." };
      if (current !== "PASSED") return { ok: false, error: "The manager must pass inspection first." };
      return { ok: true, next: "SIGNED_OFF" };
  }
}

export type ExpenseAction = "approve" | "reject";

/** Spend at or under the threshold needs the manager only; above it, the owner must approve too. */
export function nextExpenseStatus(
  current: ExpenseStatus,
  action: ExpenseAction,
  role: Role,
  amount: number,
  threshold: number,
): Result<ExpenseStatus> {
  if (current === "APPROVED" || current === "REJECTED") return { ok: false, error: "This expense has already been decided." };
  const needsOwner = amount > threshold;
  if (current === "PENDING") {
    if (role !== "MANAGER") return { ok: false, error: "The project manager reviews new expenses first." };
    if (action === "reject") return { ok: true, next: "REJECTED" };
    return { ok: true, next: needsOwner ? "MANAGER_APPROVED" : "APPROVED" };
  }
  // MANAGER_APPROVED
  if (role !== "OWNER") return { ok: false, error: "This expense is waiting for the owner's approval." };
  return { ok: true, next: action === "approve" ? "APPROVED" : "REJECTED" };
}
