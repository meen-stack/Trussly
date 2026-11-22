import type { ChangeOrderStatus, MovementKind, PurchaseOrderStatus, Role } from "@prisma/client";

/** Pure rules for change orders, purchase orders, materials, ratings and forecasting. Amounts are cents. */

type Result<S> = { ok: true; next: S } | { ok: false; error: string };

// ---------- Change orders ----------

export const canProposeChange = (r: Role) => r === "MANAGER" || r === "CONTRACTOR" || r === "OWNER";

/** The manager can approve changes up to the owner's limit; anything bigger needs the owner. */
export function decideChange(current: ChangeOrderStatus, approve: boolean, role: Role, amount: number, threshold: number): Result<ChangeOrderStatus> {
  if (current !== "PROPOSED") return { ok: false, error: "This change order has already been decided." };
  if (role === "OWNER") return { ok: true, next: approve ? "APPROVED" : "REJECTED" };
  if (role === "MANAGER") {
    if (approve && Math.abs(amount) > threshold) return { ok: false, error: "Changes over the limit need the owner's approval." };
    return { ok: true, next: approve ? "APPROVED" : "REJECTED" };
  }
  return { ok: false, error: "Only the manager or owner can decide change orders." };
}

export function canDecideChange(role: Role, amount: number, threshold: number) {
  return role === "OWNER" || (role === "MANAGER" && Math.abs(amount) <= threshold);
}

/** Approved changes are added to the line's budget when approved, so the original is the current budget less them. */
export function originalBudget(current: number, changes: { amount: number; status: ChangeOrderStatus }[]) {
  return current - changes.filter((c) => c.status === "APPROVED").reduce((s, c) => s + c.amount, 0);
}

// ---------- Purchase orders and materials ----------

export type PoItem = { quantity: number; unitPrice: number; received: number };

export const poTotal = (items: PoItem[]) => Math.round(items.reduce((s, i) => s + i.quantity * i.unitPrice, 0));
export const poReceivedValue = (items: PoItem[]) => Math.round(items.reduce((s, i) => s + Math.min(i.received, i.quantity) * i.unitPrice, 0));

/** New orders over the owner's limit wait for the owner; others are issued by the manager straight away. */
export function initialPoStatus(role: Role, total: number, threshold: number): Result<PurchaseOrderStatus> {
  if (role !== "MANAGER" && role !== "OWNER") return { ok: false, error: "Only the manager or owner can raise purchase orders." };
  if (role === "MANAGER" && total > threshold) return { ok: true, next: "PENDING_APPROVAL" };
  return { ok: true, next: "ISSUED" };
}

export function poStatusAfterDelivery(items: PoItem[]): PurchaseOrderStatus {
  if (items.every((i) => i.received >= i.quantity)) return "RECEIVED";
  if (items.some((i) => i.received > 0)) return "PARTIALLY_RECEIVED";
  return "ISSUED";
}

export const canReceive = (r: Role) => r === "SUPERVISOR" || r === "MANAGER";

/** Stock on hand from the movement log. Quantities are positive; USED takes stock away, RECEIVED and ADJUSTED add it. */
export function stockOf(movements: { kind: MovementKind; quantity: number }[]) {
  return movements.reduce((s, m) => s + (m.kind === "USED" ? -m.quantity : m.quantity), 0);
}

// ---------- Ratings ----------

export type RatingLike = { quality: number; timeliness: number; safety: number };

export const ratingScore = (r: RatingLike) => (r.quality + r.timeliness + r.safety) / 3;

export function scorecard(ratings: RatingLike[]) {
  if (ratings.length === 0) return null;
  const avg = (k: keyof RatingLike) => ratings.reduce((s, r) => s + r[k], 0) / ratings.length;
  return { count: ratings.length, quality: avg("quality"), timeliness: avg("timeliness"), safety: avg("safety"), overall: ratings.reduce((s, r) => s + ratingScore(r), 0) / ratings.length };
}

export const validScore = (n: number) => Number.isInteger(n) && n >= 1 && n <= 5;

// ---------- Forecasting ----------

/**
 * Forecast final cost for a budget line. Known costs are approved invoices, invoices in review and
 * orders placed but not yet invoiced. The line is expected to spend its revised budget unless known
 * costs already exceed it, so the forecast is the larger of the two and only real overruns show.
 */
export function forecastLine(x: { revised: number; committed: number; inReview: number; openOrders: number }) {
  const known = x.committed + x.inReview + x.openOrders;
  const forecast = Math.max(x.revised, known);
  return { known, forecast, variance: x.revised - forecast, over: known > x.revised };
}

/** Value of a purchase order not yet covered by invoices. */
export function openOrderValue(total: number, invoiced: number) {
  return Math.max(total - invoiced, 0);
}

// ---------- Disputes ----------

export type DisputeState = "OPEN" | "ESCALATED" | "RESOLVED";

/** Anyone on the project can raise a dispute; the manager can escalate; the manager or owner resolves (only the owner once escalated). */
export function disputeAction(current: DisputeState, action: "escalate" | "resolve", role: Role): Result<DisputeState> {
  if (current === "RESOLVED") return { ok: false, error: "This dispute is already resolved." };
  if (action === "escalate") {
    if (current === "ESCALATED") return { ok: false, error: "Already escalated to the owner." };
    if (role !== "MANAGER" && role !== "CONTRACTOR" && role !== "SUPERVISOR") return { ok: false, error: "Only the people on site can escalate." };
    return { ok: true, next: "ESCALATED" };
  }
  if (role === "OWNER" || role === "ADMIN") return { ok: true, next: "RESOLVED" };
  if (role === "MANAGER" && current === "OPEN") return { ok: true, next: "RESOLVED" };
  return { ok: false, error: current === "ESCALATED" ? "Escalated disputes are resolved by the owner." : "Only the manager or owner can resolve disputes." };
}

/** An invoice can't be paid while a dispute about it is open. */
export const blocksPayment = (disputes: { status: DisputeState }[]) => disputes.some((d) => d.status !== "RESOLVED");

// ---------- Documents and signatures ----------

/** Who still has to sign: the named signers without a signature. */
export function missingSigners(signerIds: string[], signatures: { userId: string }[]) {
  return signerIds.filter((id) => !signatures.some((s) => s.userId === id));
}

export const fullySigned = (signerIds: string[], signatures: { userId: string }[]) => signerIds.length > 0 && missingSigners(signerIds, signatures).length === 0;

// ---------- Retention ----------

type RetentionInvoice = { status: string; retention: number; retentionReleasedAt: Date | null };

/** Retention is released at handover: the owner or manager releases it once the project is completed. */
export function canReleaseRetention(role: Role, projectStatus: string) {
  return (role === "OWNER" || role === "MANAGER" || role === "ADMIN") && projectStatus === "COMPLETED";
}

/** Invoices still holding retention that can be released: approved or paid, not yet released. */
export const retentionHeld = <T extends RetentionInvoice>(invoices: T[]) =>
  invoices.filter((i) => i.retention > 0 && !i.retentionReleasedAt && ["APPROVED", "PROCESSING", "PAID"].includes(i.status));

/** Next version number for a document with the same title. */
export const nextVersion = (existing: { title: string; version: number }[], title: string) =>
  existing.filter((d) => d.title.trim().toLowerCase() === title.trim().toLowerCase()).reduce((m, d) => Math.max(m, d.version), 0) + 1;

// ---------- Analytics ----------

/** Average days from approval to the final payment, for paid invoices. */
export function paymentCycleDays(invoices: { decidedAt: Date | null; payments: { paidAt: Date }[] }[]) {
  const days = invoices
    .filter((i) => i.decidedAt && i.payments.length > 0)
    .map((i) => (Math.max(...i.payments.map((p) => p.paidAt.getTime())) - i.decidedAt!.getTime()) / 864e5);
  return days.length ? days.reduce((s, d) => s + d, 0) / days.length : null;
}

/** Sum amounts into calendar months, keyed "yyyy-mm", oldest first. */
export function byMonth(rows: { at: Date; amount: number }[]) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.at.getUTCFullYear()}-${String(r.at.getUTCMonth() + 1).padStart(2, "0")}`;
    m.set(k, (m.get(k) ?? 0) + r.amount);
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, amount]) => ({ month, amount }));
}
