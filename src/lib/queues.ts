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
  const [r, m, e] = await Promise.all([
    w.reports ? db.dailyReport.count({ where: w.reports }) : 0,
    w.milestones ? db.milestone.count({ where: w.milestones }) : 0,
    w.expenses ? db.expense.count({ where: w.expenses }) : 0,
  ]);
  return r + m + e;
}
