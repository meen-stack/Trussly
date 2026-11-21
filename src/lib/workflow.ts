import type { ExpenseStatus, MilestoneStatus, Role } from "@prisma/client";

/**
 * Pure state machines. Work verification and invoice payment are two separate tracks:
 * a piece of work can be verified with no invoice yet, and an invoice tied to work
 * can't be approved until that work is verified.
 */

type Result<S> = { ok: true; next: S } | { ok: false; error: string };

// ---------- Work verification ----------

export type WorkAction = "start" | "submit" | "pass" | "fail" | "approve" | "return" | "finalApprove" | "reject";

export const WORK_ACTIONS: WorkAction[] = ["start", "submit", "pass", "fail", "approve", "return", "finalApprove", "reject"];

export function nextWorkStatus(current: MilestoneStatus, action: WorkAction, role: Role, value: number, threshold: number): Result<MilestoneStatus> {
  const doer = role === "CONTRACTOR" || role === "MANAGER";
  switch (action) {
    case "start":
      if (!doer) return { ok: false, error: "Only the contractor or manager can start work." };
      if (current !== "NOT_STARTED") return { ok: false, error: "This work has already started." };
      return { ok: true, next: "IN_PROGRESS" };
    case "submit":
      if (!doer) return { ok: false, error: "Only the contractor or manager can submit work." };
      if (current !== "NOT_STARTED" && current !== "IN_PROGRESS" && current !== "CORRECTIONS") return { ok: false, error: "This work is already submitted." };
      return { ok: true, next: "SUBMITTED" };
    case "pass":
    case "fail":
      if (role !== "SUPERVISOR" && role !== "MANAGER") return { ok: false, error: "Only the site supervisor can inspect work." };
      if (current !== "SUBMITTED") return { ok: false, error: "Only submitted work can be inspected." };
      return { ok: true, next: action === "pass" ? "INSPECTED" : "CORRECTIONS" };
    case "approve":
      if (role !== "MANAGER") return { ok: false, error: "Only the project manager reviews inspected work." };
      if (current !== "INSPECTED") return { ok: false, error: "The supervisor must inspect the work first." };
      return { ok: true, next: value > threshold ? "AWAITING_OWNER" : "VERIFIED" };
    case "finalApprove":
      if (role !== "OWNER") return { ok: false, error: "Only the owner gives final approval." };
      if (current !== "AWAITING_OWNER") return { ok: false, error: "The manager must approve the work first." };
      return { ok: true, next: "VERIFIED" };
    case "return":
      if (current === "INSPECTED" && role === "MANAGER") return { ok: true, next: "CORRECTIONS" };
      if (current === "AWAITING_OWNER" && role === "OWNER") return { ok: true, next: "CORRECTIONS" };
      return { ok: false, error: "You can't send this work back at its current stage." };
    case "reject":
      if (current === "INSPECTED" && role === "MANAGER") return { ok: true, next: "REJECTED" };
      if (current === "AWAITING_OWNER" && role === "OWNER") return { ok: true, next: "REJECTED" };
      return { ok: false, error: "You can't reject this work at its current stage." };
  }
}

/** Actions this role can take on a work item right now. */
export function workOptions(current: MilestoneStatus, role: Role, value: number, threshold: number) {
  return WORK_ACTIONS.filter((a) => nextWorkStatus(current, a, role, value, threshold).ok);
}

/** Actions that must explain themselves. */
export const NEEDS_NOTE: WorkAction[] = ["fail", "return", "reject"];

// ---------- Invoices and payments ----------

export type InvoiceAction = "approve" | "reject" | "process" | "pay" | "rejectPayment";

export type InvoiceContext = {
  amount: number;
  threshold: number;
  /** Status of the work this invoice bills for, if any. */
  workStatus?: MilestoneStatus | null;
};

const isFinance = (r: Role) => r === "FINANCE" || r === "ADMIN";

export function nextInvoiceStatus(current: ExpenseStatus, action: InvoiceAction, role: Role, ctx: InvoiceContext): Result<ExpenseStatus> {
  switch (action) {
    case "approve":
      if (current === "SUBMITTED") {
        if (role !== "MANAGER") return { ok: false, error: "The project manager reviews new invoices first." };
        if (ctx.workStatus && ctx.workStatus !== "VERIFIED") return { ok: false, error: "The work on this invoice must be verified before it can be approved." };
        return { ok: true, next: ctx.amount > ctx.threshold ? "OWNER_REVIEW" : "APPROVED" };
      }
      if (current === "OWNER_REVIEW") {
        if (role !== "OWNER") return { ok: false, error: "This invoice is waiting for the owner." };
        return { ok: true, next: "APPROVED" };
      }
      return { ok: false, error: "This invoice has already been decided." };
    case "reject":
      if (current === "SUBMITTED" && role === "MANAGER") return { ok: true, next: "REJECTED" };
      if (current === "OWNER_REVIEW" && role === "OWNER") return { ok: true, next: "REJECTED" };
      return { ok: false, error: "You can't reject this invoice at its current stage." };
    case "process":
      if (!isFinance(role)) return { ok: false, error: "Only finance processes payments." };
      if (current !== "APPROVED") return { ok: false, error: "Only approved invoices can be processed." };
      return { ok: true, next: "PROCESSING" };
    case "pay":
      if (!isFinance(role)) return { ok: false, error: "Only finance records payments." };
      if (current !== "APPROVED" && current !== "PROCESSING") return { ok: false, error: "This invoice isn't ready for payment." };
      return { ok: true, next: "PROCESSING" }; // becomes PAID once the balance reaches zero, see applyPayment
    case "rejectPayment":
      if (!isFinance(role)) return { ok: false, error: "Only finance can refuse a payment." };
      if (current !== "APPROVED" && current !== "PROCESSING") return { ok: false, error: "This invoice isn't waiting for payment." };
      return { ok: true, next: "PAYMENT_REJECTED" };
  }
}

/** Amount payable now: the invoice less retention held until handover. */
export const payable = (inv: { amount: number; retention: number }) => inv.amount - inv.retention;

/** Validates a payment and works out the invoice status after it. */
export function applyPayment(inv: { amount: number; retention: number }, paidSoFar: number, amount: number): Result<ExpenseStatus> {
  const balance = payable(inv) - paidSoFar;
  if (amount <= 0) return { ok: false, error: "Enter the amount paid." };
  if (amount > balance) return { ok: false, error: "That's more than the balance due." };
  return { ok: true, next: amount === balance ? "PAID" : "PROCESSING" };
}

export function retentionFor(amount: number, percent: number) {
  return Math.round((amount * percent) / 100);
}
