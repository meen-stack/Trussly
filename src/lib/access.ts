import "server-only";
import { notFound } from "next/navigation";
import { db } from "./db";
import type { Prisma } from "@prisma/client";
import { auditScope, disputeScope, invoiceScope, visibleProjectsWhere } from "./scope";
import { auditWhere, type AuditFilter } from "./audit-query";
import type { CurrentUser } from "./auth";

export { visibleProjectsWhere };

/** Loads a project the user may see, or 404s. Used by every project page and action. */
export async function getProjectForUser(user: CurrentUser, projectId: string) {
  const project = await db.project.findFirst({ where: { id: projectId, ...visibleProjectsWhere(user) } });
  if (!project) notFound();
  return project;
}

/** The audit events this user may see, on one project or (without a project) across the projects they can see. */
export async function auditScopeFor(user: CurrentUser, projectId?: string): Promise<Prisma.AuditEventWhereInput> {
  let mine;
  if (user.role === "CONTRACTOR") {
    const project = projectId ? { projectId } : { project: visibleProjectsWhere(user) };
    const [work, invoices, disputes] = await Promise.all([
      db.milestone.findMany({ where: { ...project, assigneeId: user.id }, select: { id: true } }),
      db.expense.findMany({ where: { budgetLine: project, ...invoiceScope(user) }, select: { id: true } }),
      db.dispute.findMany({ where: { ...project, ...disputeScope(user) }, select: { id: true } }),
    ]);
    const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
    mine = { work: ids(work), invoices: ids(invoices), disputes: ids(disputes) };
  }
  return auditScope(user, mine);
}

/** The audit trail of a project, filtered, and limited to what this user may see. */
export async function auditWhereFor(user: CurrentUser, projectId: string, f: AuditFilter): Promise<Prisma.AuditEventWhereInput> {
  return { AND: [auditWhere(projectId, f), await auditScopeFor(user, projectId)] };
}
