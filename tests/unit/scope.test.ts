import { describe, expect, it } from "vitest";
import { canDisputeWork, chatScope, disputeScope, invoiceScope, visibleProjectsWhere, type Viewer } from "@/lib/scope";

const as = (role: Viewer["role"]): Viewer => ({ id: "u1", companyId: "c1", role });

describe("project visibility", () => {
  it("always stays inside the user's company", () => {
    for (const role of ["ADMIN", "OWNER", "MANAGER", "SUPERVISOR", "CONTRACTOR", "FINANCE"] as const) {
      expect(visibleProjectsWhere(as(role)).companyId).toBe("c1");
    }
  });
  it("needs membership for managers, supervisors and contractors", () => {
    for (const role of ["MANAGER", "SUPERVISOR", "CONTRACTOR"] as const) {
      expect(visibleProjectsWhere(as(role))).toEqual({ companyId: "c1", members: { some: { userId: "u1" } } });
    }
  });
  it("gives owners, admins and finance the whole company", () => {
    for (const role of ["ADMIN", "OWNER", "FINANCE"] as const) expect(visibleProjectsWhere(as(role))).toEqual({ companyId: "c1" });
  });
});

describe("invoice scope", () => {
  it("limits contractors to their own invoices", () => {
    expect(invoiceScope(as("CONTRACTOR"))).toEqual({ submitterId: "u1" });
  });
  it("leaves other roles to the project check", () => {
    expect(invoiceScope(as("MANAGER"))).toEqual({});
    expect(invoiceScope(as("FINANCE"))).toEqual({});
  });
});

describe("dispute scope", () => {
  it("limits contractors to disputes that involve them", () => {
    expect(disputeScope(as("CONTRACTOR"))).toEqual({
      OR: [
        { raisedById: "u1" },
        { messages: { some: { authorId: "u1" } } },
        { milestone: { assigneeId: "u1" } },
        { expense: { submitterId: "u1" } },
      ],
    });
  });
  it("lets managers and owners see every dispute on the project", () => {
    expect(disputeScope(as("MANAGER"))).toEqual({});
    expect(disputeScope(as("OWNER"))).toEqual({});
  });
  it("only lets contractors dispute their own work", () => {
    expect(canDisputeWork(as("CONTRACTOR"), { assigneeId: "u1" })).toBe(true);
    expect(canDisputeWork(as("CONTRACTOR"), { assigneeId: "u2" })).toBe(false);
    expect(canDisputeWork(as("CONTRACTOR"), { assigneeId: null })).toBe(false);
    expect(canDisputeWork(as("MANAGER"), { assigneeId: "u2" })).toBe(true);
  });
});

describe("chat scope", () => {
  it("needs company, membership, and for project chats a visible project", () => {
    expect(chatScope(as("CONTRACTOR"))).toEqual({
      companyId: "c1",
      members: { some: { userId: "u1" } },
      OR: [{ projectId: null }, { project: { companyId: "c1", members: { some: { userId: "u1" } } } }],
    });
  });
  it("lets owners into every project chat in their company", () => {
    expect(chatScope(as("OWNER")).OR).toEqual([{ projectId: null }, { project: { companyId: "c1" } }]);
  });
});
