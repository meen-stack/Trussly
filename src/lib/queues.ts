import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import type { CurrentUser } from "./auth";
import { visibleProjectsWhere } from "./access";

/** Work waiting on this user, by role. Shared by the nav badge, dashboard and approvals page. */
export function approvalWhere(user: CurrentUser) {
  const project = visibleProjectsWhere(user);
  const reports: Prisma.DailyReportWhereInput | null = user.role === "MANAGER" ? { status: "SUBMITTED", project } : null;
  const work: Prisma.MilestoneWhereInput | null =
    user.role === "SUPERVISOR"
      ? { status: "SUBMITTED", project }
      : user.role === "MANAGER"
        ? { status: "INSPECTED", project }
        : user.role === "OWNER"
          ? { status: "AWAITING_OWNER", project }
          : user.role === "CONTRACTOR"
            ? { status: "CORRECTIONS", assigneeId: user.id, project }
            : null;
  const expenses: Prisma.ExpenseWhereInput | null =
    user.role === "MANAGER"
      ? { status: "SUBMITTED", budgetLine: { project } }
      : user.role === "OWNER"
        ? { status: "OWNER_REVIEW", budgetLine: { project } }
        : user.role === "FINANCE" || user.role === "ADMIN"
          ? { status: { in: ["APPROVED", "PROCESSING"] }, budgetLine: { project } }
          : null;
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
  const role = user.role;
  const changeWhere: Prisma.ChangeOrderWhereInput | null =
    role === "MANAGER" ? { status: "PROPOSED", project, amount: { gte: -t, lte: t } } : role === "OWNER" ? { status: "PROPOSED", project, OR: [{ amount: { gt: t } }, { amount: { lt: -t } }] } : null;
  const [changes, orders, docs, disputes] = await Promise.all([
    changeWhere ? db.changeOrder.findMany({ where: changeWhere, include: { project: { select: { name: true } } }, orderBy: { createdAt: "asc" } }) : [],
    role === "OWNER" ? db.purchaseOrder.findMany({ where: { status: "PENDING_APPROVAL", project }, include: { project: { select: { name: true } }, items: true } }) : [],
    db.document.findMany({ where: { project, signerIds: { has: user.id }, signatures: { none: { userId: user.id } } }, include: { project: { select: { name: true } } } }),
    role === "MANAGER" || role === "OWNER"
      ? db.dispute.findMany({ where: { project, status: role === "OWNER" ? "ESCALATED" : "OPEN" }, include: { project: { select: { name: true } } } })
      : [],
  ]);
  const money = (c: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: user.company.currency, maximumFractionDigits: 0 }).format(c / 100);
  return [
    ...changes.map((c) => ({ id: c.id, kind: "Change order", title: `CO-${c.number}: ${c.title}`, sub: `${c.project.name} · ${money(c.amount)}`, href: `/projects/${c.projectId}/changes` })),
    ...orders.map((o) => ({ id: o.id, kind: "Purchase order", title: `PO-${o.number}: ${o.supplier}`, sub: `${o.project.name} · ${money(o.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0))}`, href: `/projects/${o.projectId}/materials` })),
    ...docs.map((d) => ({ id: d.id, kind: "Signature", title: `Sign: ${d.title} v${d.version}`, sub: d.project.name, href: `/projects/${d.projectId}/documents` })),
    ...disputes.map((d) => ({ id: d.id, kind: "Dispute", title: d.title, sub: `${d.project.name} · ${d.status === "ESCALATED" ? "escalated to you" : "open"}`, href: `/projects/${d.projectId}/disputes` })),
  ];
}
