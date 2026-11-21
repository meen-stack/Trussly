import type { Prisma } from "@prisma/client";

export const AUDIT_TYPES: Record<string, string> = {
  Milestone: "Work",
  Expense: "Invoices & payments",
  ChangeOrder: "Change orders",
  PurchaseOrder: "Purchase orders",
  Material: "Materials",
  Document: "Documents",
  Dispute: "Disputes",
  DailyReport: "Daily reports",
  BudgetLine: "Budget",
  Project: "Project",
};

export type AuditFilter = { type?: string; who?: string; q?: string; from?: string; to?: string };

export function auditWhere(projectId: string, f: AuditFilter): Prisma.AuditEventWhereInput {
  return {
    projectId,
    ...(f.type && AUDIT_TYPES[f.type] && { entityType: f.type }),
    ...(f.who && { actorId: f.who }),
    ...(f.q && { action: { contains: f.q, mode: "insensitive" as const } }),
    ...((f.from || f.to) && { createdAt: { ...(f.from && { gte: new Date(f.from) }), ...(f.to && { lte: new Date(`${f.to}T23:59:59`) }) } }),
  };
}

/** RFC 4180 CSV. */
export function toCsv(rows: (string | number | null | undefined)[][]) {
  return rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
}
