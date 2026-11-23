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

/** Who did each step so far. */
export type WorkHands = { submittedById?: string | null; inspectedById?: string | null; approvedById?: string | null };

/**
 * Separation of duties: each check must be done by someone new. Whoever submitted work can't
 * inspect or approve it, the inspector can't also approve it, and whoever approved it for the
 * manager can't give the owner's final approval too (for example as the owner's delegate).
 */
export function separationError(current: MilestoneStatus, action: WorkAction, userId: string, hands: WorkHands): string | null {
  const did = (id?: string | null) => !!id && id === userId;
  if ((action === "pass" || action === "fail") && did(hands.submittedById)) return "You submitted this work, so someone else must inspect it.";
  if (action === "approve" || action === "return" || action === "reject" || action === "finalApprove") {
    if (did(hands.submittedById)) return "You submitted this work, so someone else must approve it.";
    if (did(hands.inspectedById)) return "You inspected this work, so someone else must approve it.";
    if (current === "AWAITING_OWNER" && did(hands.approvedById)) return "You approved this work for the manager, so the owner must give the final approval.";
  }
  return null;
}

/** Actions this person can take on a work item right now. */
export function workOptions(current: MilestoneStatus, role: Role, value: number, threshold: number, userId?: string, hands: WorkHands = {}) {
  return WORK_ACTIONS.filter((a) => nextWorkStatus(current, a, role, value, threshold).ok && (!userId || !separationError(current, a, userId, hands)));
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
  /** At or above this amount the owner must confirm too, whatever the approval limit. */
  twoFrom?: number;
};

const isFinance = (r: Role) => r === "FINANCE" || r === "ADMIN";

export function nextInvoiceStatus(current: ExpenseStatus, action: InvoiceAction, role: Role, ctx: InvoiceContext): Result<ExpenseStatus> {
  switch (action) {
    case "approve":
      if (current === "SUBMITTED") {
        if (role !== "MANAGER") return { ok: false, error: "The project manager reviews new invoices first." };
        if (ctx.workStatus && ctx.workStatus !== "VERIFIED") return { ok: false, error: "The work on this invoice must be verified before it can be approved." };
        const ownerToo = ctx.amount > ctx.threshold || (ctx.twoFrom !== undefined && ctx.amount >= ctx.twoFrom);
        return { ok: true, next: ownerToo ? "OWNER_REVIEW" : "APPROVED" };
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

type Payable = { amount: number; retention: number; retentionReleasedAt?: Date | null };

/** Amount payable now: the invoice less retention, until the retention is released at handover. */
export const payable = (inv: Payable) => inv.amount - (inv.retentionReleasedAt ? 0 : inv.retention);

/** After retention is released, a fully paid invoice owes the retention again. */
export const statusAfterRelease = (status: ExpenseStatus): ExpenseStatus => (status === "PAID" ? "PROCESSING" : status);

/** Validates a payment and works out the invoice status after it. */
export function applyPayment(inv: Payable, paidSoFar: number, amount: number): Result<ExpenseStatus> {
  const balance = payable(inv) - paidSoFar;
  if (amount <= 0) return { ok: false, error: "Enter the amount paid." };
  if (amount > balance) return { ok: false, error: "That's more than the balance due." };
  return { ok: true, next: amount === balance ? "PAID" : "PROCESSING" };
}

/** Invoices that still claim part of a work item's value: everything not rejected. */
const CLAIMING: ExpenseStatus[] = ["SUBMITTED", "OWNER_REVIEW", "APPROVED", "PROCESSING", "PAID"];

/**
 * How much of a work item's value is still free to invoice. Work can be billed in instalments
 * (a deposit, progress claims, the balance), but never for more than it's worth in total.
 */
export function invoiceRoom(workValue: number, invoices: { amount: number; status: ExpenseStatus }[]) {
  const claimed = invoices.filter((i) => CLAIMING.includes(i.status)).reduce((s, i) => s + i.amount, 0);
  return Math.max(workValue - claimed, 0);
}

export function retentionFor(amount: number, percent: number) {
  return Math.round((amount * percent) / 100);
}
