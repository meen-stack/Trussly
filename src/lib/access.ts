import "server-only";
import { notFound } from "next/navigation";
import { db } from "./db";
import { can } from "./permissions";
import type { CurrentUser } from "./auth";

/** Where-clause for projects this user can see. */
export function visibleProjectsWhere(user: CurrentUser) {
  return can.seeAllProjects(user.role)
    ? { companyId: user.companyId }
    : { companyId: user.companyId, members: { some: { userId: user.id } } };
}

/** Loads a project the user may see, or 404s. Used by every project page and action. */
export async function getProjectForUser(user: CurrentUser, projectId: string) {
  const project = await db.project.findFirst({ where: { id: projectId, ...visibleProjectsWhere(user) } });
  if (!project) notFound();
  return project;
}
