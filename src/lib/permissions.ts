import type { Role } from "@prisma/client";

/** Pure permission rules, shared by server actions and UI. */
export const can = {
  createProject: (r: Role) => r === "ADMIN" || r === "OWNER" || r === "MANAGER",
  manageProject: (r: Role) => r === "ADMIN" || r === "OWNER" || r === "MANAGER",
  submitReport: (r: Role) => r === "SUPERVISOR" || r === "MANAGER",
  reviewReport: (r: Role) => r === "MANAGER" || r === "ADMIN",
  submitMilestone: (r: Role) => r === "CONTRACTOR" || r === "MANAGER",
  inspectMilestone: (r: Role) => r === "MANAGER",
  signOffMilestone: (r: Role) => r === "OWNER",
  submitExpense: (r: Role) => r === "CONTRACTOR" || r === "MANAGER" || r === "SUPERVISOR",
  managerApproveExpense: (r: Role) => r === "MANAGER",
  ownerApproveExpense: (r: Role) => r === "OWNER",
  inviteUsers: (r: Role) => r === "ADMIN" || r === "OWNER",
  /** Owners and admins see every company project; others only projects they belong to. */
  seeAllProjects: (r: Role) => r === "ADMIN" || r === "OWNER",
};

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  OWNER: "Owner",
  MANAGER: "Project manager",
  SUPERVISOR: "Site supervisor",
  CONTRACTOR: "Contractor",
};
