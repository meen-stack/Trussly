import "server-only";
import { notFound } from "next/navigation";
import { db } from "./db";
import { visibleProjectsWhere } from "./scope";
import type { CurrentUser } from "./auth";

export { visibleProjectsWhere };

/** Loads a project the user may see, or 404s. Used by every project page and action. */
export async function getProjectForUser(user: CurrentUser, projectId: string) {
  const project = await db.project.findFirst({ where: { id: projectId, ...visibleProjectsWhere(user) } });
  if (!project) notFound();
  return project;
}
