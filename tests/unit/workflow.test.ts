import { describe, expect, it } from "vitest";
import { applyPayment, nextInvoiceStatus, nextWorkStatus, retentionFor, workOptions } from "@/lib/workflow";

const T = 10_000;

describe("work verification", () => {
  it("runs contractor, supervisor, manager for work under the owner's limit", () => {
    expect(nextWorkStatus("NOT_STARTED", "start", "CONTRACTOR", 5_000, T)).toEqual({ ok: true, next: "IN_PROGRESS" });
    expect(nextWorkStatus("IN_PROGRESS", "submit", "CONTRACTOR", 5_000, T)).toEqual({ ok: true, next: "SUBMITTED" });
    expect(nextWorkStatus("SUBMITTED", "pass", "SUPERVISOR", 5_000, T)).toEqual({ ok: true, next: "INSPECTED" });
    expect(nextWorkStatus("INSPECTED", "approve", "MANAGER", 5_000, T)).toEqual({ ok: true, next: "VERIFIED" });
  });

  it("needs the owner's final approval above the limit", () => {
    expect(nextWorkStatus("INSPECTED", "approve", "MANAGER", 50_000, T)).toEqual({ ok: true, next: "AWAITING_OWNER" });
    expect(nextWorkStatus("AWAITING_OWNER", "finalApprove", "MANAGER", 50_000, T).ok).toBe(false);
    expect(nextWorkStatus("AWAITING_OWNER", "finalApprove", "OWNER", 50_000, T)).toEqual({ ok: true, next: "VERIFIED" });
  });

  it("blocks skipping inspection and wrong roles", () => {
    expect(nextWorkStatus("SUBMITTED", "approve", "MANAGER", 5_000, T).ok).toBe(false);
    expect(nextWorkStatus("SUBMITTED", "pass", "CONTRACTOR", 5_000, T).ok).toBe(false);
    expect(nextWorkStatus("SUBMITTED", "pass", "FINANCE", 5_000, T).ok).toBe(false);
    expect(nextWorkStatus("NOT_STARTED", "finalApprove", "OWNER", 5_000, T).ok).toBe(false);
  });

  it("sends failed work back for corrections and lets it be resubmitted", () => {
    expect(nextWorkStatus("SUBMITTED", "fail", "SUPERVISOR", 5_000, T)).toEqual({ ok: true, next: "CORRECTIONS" });
    expect(nextWorkStatus("INSPECTED", "return", "MANAGER", 5_000, T)).toEqual({ ok: true, next: "CORRECTIONS" });
    expect(nextWorkStatus("CORRECTIONS", "submit", "CONTRACTOR", 5_000, T)).toEqual({ ok: true, next: "SUBMITTED" });
  });

  it("lists only the actions a role can take", () => {
    expect(workOptions("SUBMITTED", "SUPERVISOR", 5_000, T)).toEqual(["pass", "fail"]);
    expect(workOptions("INSPECTED", "MANAGER", 5_000, T)).toEqual(["approve", "return", "reject"]);
    expect(workOptions("VERIFIED", "OWNER", 5_000, T)).toEqual([]);
  });
});

describe("invoices and payments", () => {
  it("won't approve an invoice until its work is verified", () => {
    expect(nextInvoiceStatus("SUBMITTED", "approve", "MANAGER", { amount: 5_000, threshold: T, workStatus: "INSPECTED" }).ok).toBe(false);
    expect(nextInvoiceStatus("SUBMITTED", "approve", "MANAGER", { amount: 5_000, threshold: T, workStatus: "VERIFIED" })).toEqual({ ok: true, next: "APPROVED" });
    expect(nextInvoiceStatus("SUBMITTED", "approve", "MANAGER", { amount: 5_000, threshold: T })).toEqual({ ok: true, next: "APPROVED" });
  });

  it("routes large invoices to the owner", () => {
    expect(nextInvoiceStatus("SUBMITTED", "approve", "MANAGER", { amount: 50_000, threshold: T })).toEqual({ ok: true, next: "OWNER_REVIEW" });
    expect(nextInvoiceStatus("OWNER_REVIEW", "approve", "MANAGER", { amount: 50_000, threshold: T }).ok).toBe(false);
    expect(nextInvoiceStatus("OWNER_REVIEW", "approve", "OWNER", { amount: 50_000, threshold: T })).toEqual({ ok: true, next: "APPROVED" });
  });

  it("only lets finance pay, and only approved invoices", () => {
    expect(nextInvoiceStatus("APPROVED", "pay", "MANAGER", { amount: 5_000, threshold: T }).ok).toBe(false);
    expect(nextInvoiceStatus("SUBMITTED", "pay", "FINANCE", { amount: 5_000, threshold: T }).ok).toBe(false);
    expect(nextInvoiceStatus("APPROVED", "process", "FINANCE", { amount: 5_000, threshold: T })).toEqual({ ok: true, next: "PROCESSING" });
    expect(nextInvoiceStatus("PROCESSING", "rejectPayment", "FINANCE", { amount: 5_000, threshold: T })).toEqual({ ok: true, next: "PAYMENT_REJECTED" });
  });

  it("tracks partial payments against retention", () => {
    const inv = { amount: 10_000, retention: retentionFor(10_000, 5) };
    expect(inv.retention).toBe(500);
    expect(applyPayment(inv, 0, 4_000)).toEqual({ ok: true, next: "PROCESSING" });
    expect(applyPayment(inv, 4_000, 5_500)).toEqual({ ok: true, next: "PAID" });
    expect(applyPayment(inv, 4_000, 6_000).ok).toBe(false);
    expect(applyPayment(inv, 0, 0).ok).toBe(false);
  });
});
