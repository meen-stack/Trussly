import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import type { CurrentUser } from "./auth";
import { visibleProjectsWhere } from "./access";

/** Work waiting on this user, by role. Shared by the nav badge, dashboard and approvals page. */
export function approvalWhere(user: CurrentUser) {
  const project = visibleProjectsWhere(user);
  const reports: Prisma.DailyReportWhereInput | null =
    user.role === "MANAGER" ? { status: "SUBMITTED", project } : null;
  const milestones: Prisma.MilestoneWhereInput | null =
    user.role === "MANAGER"
      ? { status: "SUBMITTED", project }
      : user.role === "OWNER"
        ? { status: "PASSED", project }
        : null;
  const expenses: Prisma.ExpenseWhereInput | null =
    user.role === "MANAGER"
      ? { status: "PENDING", budgetLine: { project } }
      : user.role === "OWNER"
        ? { status: "MANAGER_APPROVED", budgetLine: { project } }
        : null;
  return { reports, milestones, expenses };
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
