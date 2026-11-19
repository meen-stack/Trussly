import "server-only";
import type { Prisma, Role } from "@prisma/client";
import { db } from "./db";
import { appUrl, sendEmail } from "./email";

type Note = { title: string; body: string; href?: string };

/** In-app notification plus email for each user. */
export async function notifyUsers(userIds: string[], note: Note) {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;
  await db.notification.createMany({ data: unique.map((userId) => ({ userId, ...note })) });
  const users = await db.user.findMany({ where: { id: { in: unique } }, select: { email: true } });
  await Promise.all(
    users.map((u) => sendEmail(u.email, note.title, `${note.body}${note.href ? `\n\nOpen: ${appUrl(note.href)}` : ""}`)),
  );
}

/** Notifies project members with the given roles. Owners are included through company membership. */
export async function notifyProjectRoles(projectId: string, roles: Role[], note: Note, exceptUserId?: string) {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { companyId: true } });
  if (!project) return;
  const users = await db.user.findMany({
    where: {
      role: { in: roles },
      companyId: project.companyId,
      OR: [{ role: "OWNER" }, { memberships: { some: { projectId } } }],
    },
    select: { id: true },
  });
  await notifyUsers(users.map((u) => u.id).filter((id) => id !== exceptUserId), note);
}

export async function audit(
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  projectId?: string,
  detail?: Prisma.InputJsonValue,
) {
  await db.auditEvent.create({ data: { actorId, action, entityType, entityId, projectId, detail } });
}
