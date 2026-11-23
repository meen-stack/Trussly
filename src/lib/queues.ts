import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import type { CurrentUser } from "./auth";
import { visibleProjectsWhere } from "./access";
import { CONFIRMER_ROLES, actsForOwner, confirmAs } from "./release";
import { canDecideChange, poTotal } from "./commercial";

/** Work waiting on this user, by role. Shared by the nav badge, dashboard and approvals page. */
export function approvalWhere(user: CurrentUser) {
  const project = visibleProjectsWhere(user);
  // `not` alone skips nulls in SQL, so "not done by me" has to allow nobody too.
  const notBy = (field: "submittedById" | "inspectedById" | "approvedById"): Prisma.MilestoneWhereInput => ({ OR: [{ [field]: null }, { [field]: { not: user.id } }] });
  const reports: Prisma.DailyReportWhereInput | null = user.role === "MANAGER" ? { status: "SUBMITTED", project } : null;
  const ownWork: Prisma.MilestoneWhereInput | null =
    user.role === "SUPERVISOR"
      ? { status: "SUBMITTED", project }
      : user.role === "MANAGER"
        ? { status: "INSPECTED", project }
        : user.role === "OWNER"
          ? { status: "AWAITING_OWNER", project }
          : user.role === "CONTRACTOR"
            ? { status: "CORRECTIONS", assigneeId: user.id, project }
            : null;
  const delegateWork: Prisma.MilestoneWhereInput | null = actsForOwner(user.role, user.company) ? { status: "AWAITING_OWNER", project, AND: [notBy("approvedById")] } : null;
  const anyWork = ownWork && delegateWork ? { OR: [ownWork, delegateWork] } : (ownWork ?? delegateWork);
  // Leave out work this person submitted or inspected: someone else must check it (see separationError).
  const work: Prisma.MilestoneWhereInput | null = anyWork && user.role !== "CONTRACTOR" ? { AND: [anyWork, notBy("submittedById"), notBy("inspectedById")] } : anyWork;
  const own: Prisma.ExpenseWhereInput | null =
    user.role === "MANAGER"
      ? { status: "SUBMITTED", budgetLine: { project } }
      : user.role === "OWNER"
        ? { status: "OWNER_REVIEW", budgetLine: { project } }
        : user.role === "FINANCE" || user.role === "ADMIN"
          ? { status: { in: ["APPROVED", "PROCESSING"] }, budgetLine: { project } }
          : null;
  // Roles the owner has delegated to also see invoices waiting for the owner.
  const forOwner: Prisma.ExpenseWhereInput | null = actsForOwner(user.role, user.company) ? { status: "OWNER_REVIEW", budgetLine: { project }, submitterId: { not: user.id } } : null;
  const expenses = own && forOwner ? { OR: [own, forOwner] } : (own ?? forOwner);
  return { reports, milestones: work, expenses };
}

export async function approvalCount(user: CurrentUser) {
  const w = approvalWhere(user);
  const [r, m, e, o] = await Promise.all([
    w.reports ? db.dailyReport.count({ where: w.reports }) : 0,
    w.milestones ? db.milestone.count({ where: w.milestones }) : 0,
    w.expenses ? db.expense.count({ where: w.expenses }) : 0,
    otherQueue(user).then((q) => q.length),
  ]);
  return r + m + e + o;
}

export type QueueItem = { id: string; kind: string; title: string; sub: string; href: string };

/** Change orders, purchase orders, signatures and disputes waiting on this user. */
export async function otherQueue(user: CurrentUser): Promise<QueueItem[]> {
  const project = visibleProjectsWhere(user);
  const t = user.company.approvalThreshold;
  const mayConfirm = user.role === "OWNER" || CONFIRMER_ROLES.includes(user.role) || actsForOwner(user.role, user.company);
  const [changes, orders, docs, disputes] = await Promise.all([
    mayConfirm ? db.changeOrder.findMany({ where: { status: "PROPOSED", project }, include: { project: { select: { name: true } } }, orderBy: { createdAt: "asc" } }) : [],
    mayConfirm ? db.purchaseOrder.findMany({ where: { status: "PENDING_APPROVAL", project }, include: { project: { select: { name: true } }, items: true } }) : [],
    db.document.findMany({ where: { project, signerIds: { has: user.id }, signatures: { none: { userId: user.id } } }, include: { project: { select: { name: true } } } }),
    user.role === "MANAGER" || user.role === "OWNER"
      ? db.dispute.findMany({ where: { project, status: user.role === "OWNER" ? "ESCALATED" : "OPEN" }, include: { project: { select: { name: true } } } })
      : [],
  ]);
  const prior = await db.confirmation.findMany({ where: { targetId: { in: [...changes.map((c) => c.id), ...orders.map((o) => o.id)] } }, orderBy: { createdAt: "asc" } });
  const priorFor = (id: string) => prior.filter((c) => c.targetId === id);
  const waitingOnMe = changes.filter((c) =>
    confirmAs({ user, company: user.company, amount: c.amount, two: c.amount > 0 ? undefined : false, requesterId: c.requestedById, prior: priorFor(c.id), singleOk: (r) => canDecideChange(r, c.amount, t) }).ok,
  );
  const ordersOnMe = orders.filter((o) =>
    confirmAs({ user, company: user.company, amount: poTotal(o.items), requesterId: o.createdById, prior: priorFor(o.id), singleOk: (r) => r === "OWNER" }).ok,
  );
  const money = (c: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: user.company.currency, maximumFractionDigits: 0 }).format(c / 100);
  return [
    ...waitingOnMe.map((c) => ({ id: c.id, kind: "Change order", title: `CO-${c.number}: ${c.title}`, sub: `${c.project.name} · ${money(c.amount)}`, href: `/projects/${c.projectId}/changes` })),
    ...ordersOnMe.map((o) => ({ id: o.id, kind: "Purchase order", title: `PO-${o.number}: ${o.supplier}`, sub: `${o.project.name} · ${money(o.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0))}`, href: `/projects/${o.projectId}/materials` })),
    ...docs.map((d) => ({ id: d.id, kind: "Signature", title: `Sign: ${d.title} v${d.version}`, sub: d.project.name, href: `/projects/${d.projectId}/documents` })),
    ...disputes.map((d) => ({ id: d.id, kind: "Dispute", title: d.title, sub: `${d.project.name} · ${d.status === "ESCALATED" ? "escalated to you" : "open"}`, href: `/projects/${d.projectId}/disputes` })),
  ];
}
