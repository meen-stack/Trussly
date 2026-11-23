import type { Role } from "@prisma/client";

/** Pure permission rules, shared by server actions and UI. */
export const can = {
  createProject: (r: Role) => r === "ADMIN" || r === "OWNER" || r === "MANAGER",
  manageProject: (r: Role) => r === "ADMIN" || r === "OWNER" || r === "MANAGER",
  submitReport: (r: Role) => r === "SUPERVISOR" || r === "MANAGER",
  reviewReport: (r: Role) => r === "MANAGER" || r === "ADMIN",
  submitExpense: (r: Role) => r === "CONTRACTOR" || r === "MANAGER" || r === "SUPERVISOR",
  /** Finance records and tracks payments. */
  pay: (r: Role) => r === "FINANCE" || r === "ADMIN",
  seeFinance: (r: Role) => r === "FINANCE" || r === "ADMIN" || r === "OWNER" || r === "MANAGER",
  /**
   * The project's budget, spend, forecast and everyone's invoices. Contractors and supervisors
   * only see the money on their own work and invoices.
   */
  seeProjectFinances: (r: Role) => r === "FINANCE" || r === "ADMIN" || r === "OWNER" || r === "MANAGER",
  inviteUsers: (r: Role) => r === "ADMIN" || r === "OWNER",
  /** Owners, admins and finance see every company project; others only projects they belong to. */
  rate: (r: Role) => r === "MANAGER" || r === "OWNER" || r === "SUPERVISOR",
  uploadDocument: (r: Role) => r !== "FINANCE",
  seeAnalytics: (r: Role) => r === "ADMIN" || r === "OWNER" || r === "MANAGER" || r === "FINANCE",
  seeAllProjects: (r: Role) => r === "ADMIN" || r === "OWNER" || r === "FINANCE",
};

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  OWNER: "Owner",
  MANAGER: "Project manager",
  SUPERVISOR: "Site supervisor",
  CONTRACTOR: "Contractor",
  FINANCE: "Accountant",
};
