import type { Prisma, Role } from "@prisma/client";
import { can } from "./permissions";

/**
 * Object-level access rules as Prisma where-clauses. Pure, so they can be unit tested.
 * Every page and action that loads a record by id should combine its id with one of these.
 */
export type Viewer = { id: string; companyId: string; role: Role };

/** Projects this user can see: the whole company for owners, admins and finance, otherwise projects they belong to. */
export function visibleProjectsWhere(user: Viewer): Prisma.ProjectWhereInput {
  return can.seeAllProjects(user.role)
    ? { companyId: user.companyId }
    : { companyId: user.companyId, members: { some: { userId: user.id } } };
}

/**
 * Invoices a user can see on a project they can see. People who don't see the project's
 * finances (contractors and supervisors) only see invoices they submitted.
 */
export function invoiceScope(user: Viewer): Prisma.ExpenseWhereInput {
  return can.seeProjectFinances(user.role) ? {} : { submitterId: user.id };
}

/**
 * Disputes a user can see on a project they can see. Contractors only see disputes
 * they raised or wrote in, or that are about their own work or invoices.
 */
export function disputeScope(user: Viewer): Prisma.DisputeWhereInput {
  // Supervisors handle disputes about work on site, but not about other people's invoices.
  if (user.role === "SUPERVISOR") return { OR: [{ expenseId: null }, { raisedById: user.id }, { expense: { submitterId: user.id } }] };
  if (user.role !== "CONTRACTOR") return {};
  return {
    OR: [
      { raisedById: user.id },
      { messages: { some: { authorId: user.id } } },
      { milestone: { assigneeId: user.id } },
      { expense: { submitterId: user.id } },
    ],
  };
}

/**
 * Chats a user can open: ones they are a member of in their own company. A project chat
 * also needs the project to still be visible, so someone taken off a project loses its chat.
 */
export function chatScope(user: Viewer): Prisma.ConversationWhereInput {
  return {
    companyId: user.companyId,
    members: { some: { userId: user.id } },
    OR: [{ projectId: null }, { project: visibleProjectsWhere(user) }],
  };
}

/** Contractors can only raise disputes about work assigned to them. */
export function canDisputeWork(user: Viewer, work: { assigneeId: string | null }) {
  return user.role !== "CONTRACTOR" || work.assigneeId === user.id;
}

/** Audit trail record types with no money in them, which supervisors see for the whole project. */
export const SITE_AUDIT_TYPES = ["Milestone", "DailyReport", "Material", "Document"];

/**
 * Audit trail events a user can see on a project they can see. The commercial side sees everything.
 * Supervisors see site records and their own actions. Contractors see their own actions and what
 * happened to their own work, invoices and disputes, so they never see anyone else's money.
 */
export function auditScope(user: Viewer, mine: { work: string[]; invoices: string[]; disputes: string[] } = { work: [], invoices: [], disputes: [] }): Prisma.AuditEventWhereInput {
  if (can.seeProjectFinances(user.role)) return {};
  if (user.role === "SUPERVISOR") return { OR: [{ actorId: user.id }, { entityType: { in: SITE_AUDIT_TYPES } }] };
  return {
    OR: [
      { actorId: user.id },
      { entityType: "Milestone", entityId: { in: mine.work } },
      { entityType: "Expense", entityId: { in: mine.invoices } },
      { entityType: "Dispute", entityId: { in: mine.disputes } },
      { entityType: "Document" },
    ],
  };
}
