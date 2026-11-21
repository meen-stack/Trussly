import { describe, expect, it } from "vitest";
import { paymentKey, workLabel, workPaymentKey, type InvoiceLike } from "@/lib/status";

const day = 864e5;
const today = new Date("2026-11-21T12:00:00Z");
const inv = (o: Partial<InvoiceLike>): InvoiceLike => ({ status: "APPROVED", amount: 10_000, retention: 500, dueDate: new Date(today.getTime() + 10 * day), payments: [], ...o });

describe("payment status", () => {
  it("works out awaiting, partial, overdue and paid", () => {
    expect(paymentKey(inv({}), today)).toBe("AWAITING_PAYMENT");
    expect(paymentKey(inv({ status: "PROCESSING", payments: [{ amount: 3_000 }] }), today)).toBe("PARTIALLY_PAID");
    expect(paymentKey(inv({ dueDate: new Date(today.getTime() - day) }), today)).toBe("OVERDUE");
    expect(paymentKey(inv({ status: "PAID", payments: [{ amount: 9_500 }] }), today)).toBe("PAID");
    expect(paymentKey(inv({ status: "OWNER_REVIEW" }), today)).toBe("UNDER_REVIEW");
  });

  it("shows work with no invoice, and completes work once verified and paid", () => {
    expect(workPaymentKey([], today)).toBe("NO_INVOICE");
    expect(workLabel("VERIFIED", []).label).toBe("Approved · verified");
    expect(workLabel("VERIFIED", [{ status: "PAID" }]).label).toBe("Completed");
    expect(workLabel("SUBMITTED", [{ status: "PAID" }]).label).toBe("Awaiting inspection");
  });

  it("ignores rejected invoices when a newer one is live", () => {
    expect(workPaymentKey([inv({ status: "REJECTED" }), inv({ status: "SUBMITTED" })], today)).toBe("SUBMITTED");
  });
});
