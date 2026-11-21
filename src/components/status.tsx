import type { ExpenseStatus, MilestoneStatus } from "@prisma/client";
import { Badge, type Tone } from "./ui";
import { PAYMENT_LABEL, paymentKey, workLabel, workPaymentKey, type InvoiceLike, type Label } from "@/lib/status";

const MAP: Record<string, [string, Tone]> = {
  // reports
  SUBMITTED: ["Awaiting review", "brand"],
  ACCEPTED: ["Accepted", "ok"],
  RETURNED: ["Returned", "bad"],
  // projects
  PLANNING: ["Planning", "neutral"],
  ACTIVE: ["Active", "ok"],
  ON_HOLD: ["On hold", "warn"],
  COMPLETED: ["Completed", "steel"],
};

/** Report and project statuses. */
export function StatusBadge({ status }: { status: string }) {
  const [label, tone] = MAP[status] ?? [status, "neutral"];
  return <Badge tone={tone}>{label}</Badge>;
}

export function LabelBadge({ l }: { l: Label }) {
  return <Badge tone={l.tone}>{l.label}</Badge>;
}

export function WorkBadge({ status, invoices }: { status: MilestoneStatus; invoices?: { status: ExpenseStatus }[] }) {
  return <LabelBadge l={workLabel(status, invoices)} />;
}

export function PaymentBadge({ invoice }: { invoice: InvoiceLike }) {
  return <LabelBadge l={PAYMENT_LABEL[paymentKey(invoice)]} />;
}

export function WorkPaymentBadge({ invoices }: { invoices: InvoiceLike[] }) {
  return <LabelBadge l={PAYMENT_LABEL[workPaymentKey(invoices)]} />;
}
