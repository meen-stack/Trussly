import type { ExpenseStatus, MilestoneStatus } from "@prisma/client";
import { payable } from "./workflow";

export type Tone = "neutral" | "brand" | "ok" | "warn" | "bad" | "steel";
export type Label = { label: string; tone: Tone };

/** Work track labels. Each status means exactly one thing. */
export const WORK_LABEL: Record<MilestoneStatus, Label> = {
  NOT_STARTED: { label: "Not started", tone: "neutral" },
  IN_PROGRESS: { label: "In progress", tone: "brand" },
  SUBMITTED: { label: "Awaiting inspection", tone: "warn" },
  INSPECTED: { label: "Awaiting manager", tone: "warn" },
  AWAITING_OWNER: { label: "Awaiting owner", tone: "warn" },
  CORRECTIONS: { label: "Requires corrections", tone: "bad" },
  VERIFIED: { label: "Approved · verified", tone: "ok" },
  REJECTED: { label: "Rejected", tone: "bad" },
};

/** Work that is verified and whose invoices are all fully paid is complete. */
export function workLabel(status: MilestoneStatus, invoices: { status: ExpenseStatus }[] = []): Label {
  const live = invoices.filter((i) => i.status !== "REJECTED" && i.status !== "PAYMENT_REJECTED");
  if (status === "VERIFIED" && live.length > 0 && live.every((i) => i.status === "PAID")) return { label: "Completed", tone: "steel" };
  return WORK_LABEL[status];
}

export type PaymentKey =
  | "NO_INVOICE"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "AWAITING_PAYMENT"
  | "PROCESSING"
  | "PARTIALLY_PAID"
  | "RETENTION_DUE"
  | "PAID"
  | "REJECTED"
  | "PAYMENT_REJECTED"
  | "OVERDUE";

export const PAYMENT_LABEL: Record<PaymentKey, Label> = {
  NO_INVOICE: { label: "No invoice", tone: "neutral" },
  SUBMITTED: { label: "Invoice submitted", tone: "brand" },
  UNDER_REVIEW: { label: "Under review", tone: "warn" },
  AWAITING_PAYMENT: { label: "Approved · awaiting payment", tone: "brand" },
  PROCESSING: { label: "Payment processing", tone: "brand" },
  PARTIALLY_PAID: { label: "Partially paid", tone: "warn" },
  RETENTION_DUE: { label: "Retention released · awaiting payment", tone: "brand" },
  PAID: { label: "Fully paid", tone: "ok" },
  REJECTED: { label: "Invoice rejected", tone: "bad" },
  PAYMENT_REJECTED: { label: "Payment rejected", tone: "bad" },
  OVERDUE: { label: "Overdue", tone: "bad" },
};

export type InvoiceLike = { status: ExpenseStatus; amount: number; retention: number; retentionReleasedAt?: Date | null; dueDate: Date | null; payments: { amount: number }[] };

export const paidOf = (inv: { payments: { amount: number }[] }) => inv.payments.reduce((s, p) => s + p.amount, 0);
export const balanceOf = (inv: InvoiceLike) => payable(inv) - paidOf(inv);

/** Where an invoice is on the payment track, including the states worked out from dates and payments. */
export function paymentKey(inv: InvoiceLike, today = new Date()): PaymentKey {
  switch (inv.status) {
    case "SUBMITTED":
      return "SUBMITTED";
    case "OWNER_REVIEW":
      return "UNDER_REVIEW";
    case "PAID":
      return "PAID";
    case "REJECTED":
      return "REJECTED";
    case "PAYMENT_REJECTED":
      return "PAYMENT_REJECTED";
  }
  // APPROVED or PROCESSING: money is owed.
  if (inv.dueDate && inv.dueDate < today && balanceOf(inv) > 0) return "OVERDUE";
  if (inv.retentionReleasedAt && paidOf(inv) >= inv.amount - inv.retention) return "RETENTION_DUE";
  if (paidOf(inv) > 0) return "PARTIALLY_PAID";
  return inv.status === "PROCESSING" ? "PROCESSING" : "AWAITING_PAYMENT";
}

/** The payment state for a piece of work, from its invoices. */
export function workPaymentKey(invoices: InvoiceLike[], today = new Date()): PaymentKey {
  const live = invoices.filter((i) => i.status !== "REJECTED" && i.status !== "PAYMENT_REJECTED");
  if (live.length === 0) return invoices.length ? paymentKey(invoices[invoices.length - 1], today) : "NO_INVOICE";
  const keys = live.map((i) => paymentKey(i, today));
  const order: PaymentKey[] = ["OVERDUE", "SUBMITTED", "UNDER_REVIEW", "AWAITING_PAYMENT", "PROCESSING", "PARTIALLY_PAID", "RETENTION_DUE", "PAID"];
  if (keys.every((k) => k === "PAID")) return "PAID";
  if (keys.includes("RETENTION_DUE") && keys.every((k) => k === "PAID" || k === "RETENTION_DUE")) return "RETENTION_DUE";
  if (keys.some((k) => k === "PAID" || k === "PARTIALLY_PAID" || k === "RETENTION_DUE")) return keys.includes("OVERDUE") ? "OVERDUE" : "PARTIALLY_PAID";
  return order.find((k) => keys.includes(k)) ?? "NO_INVOICE";
}
