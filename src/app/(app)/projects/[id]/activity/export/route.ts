import { requireUser } from "@/lib/auth";
import { auditWhereFor, getProjectForUser } from "@/lib/access";
import { db } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/permissions";
import { AUDIT_TYPES, toCsv } from "@/lib/audit-query";

/** The filtered audit trail as a CSV download. */
export async function GET(req: Request, { params }: RouteContext<"/projects/[id]/activity/export">) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProjectForUser(user, id);
  const sp = new URL(req.url).searchParams;
  const events = await db.auditEvent.findMany({
    where: await auditWhereFor(user, project.id, Object.fromEntries(sp)),
    include: { actor: true },
    orderBy: { createdAt: "asc" },
  });
  const csv = toCsv([
    ["Time (UTC)", "Person", "Role", "Action", "Type", "Record", "Note"],
    ...events.map((e) => [e.createdAt.toISOString(), e.actor.name, ROLE_LABEL[e.actor.role], e.action, AUDIT_TYPES[e.entityType] ?? e.entityType, e.entityId, (e.detail as { note?: string } | null)?.note ?? ""]),
  ]);
  const name = `${project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-audit-trail.csv`;
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } });
}
