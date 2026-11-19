import type { Metadata } from "next";
import { format } from "date-fns";
import { requireUser } from "@/lib/auth";
import { getProjectForUser } from "@/lib/access";
import { db } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/permissions";
import { Card, CardHeader, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Audit trail" };

export default async function ActivityPage({ params }: PageProps<"/projects/[id]/activity">) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProjectForUser(user, id);
  const events = await db.auditEvent.findMany({ where: { projectId: project.id }, include: { actor: true }, orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <Card>
      <CardHeader title="Audit trail" subtitle="Every approval, rejection and change, with who did it and when. Entries can't be edited." />
      {events.length === 0 ? (
        <EmptyState title="Nothing recorded yet" />
      ) : (
        <ol className="divide-y divide-line">
          {events.map((e) => {
            const note = (e.detail as { note?: string } | null)?.note;
            return (
              <li key={e.id} className="flex gap-4 px-5 py-3 text-sm">
                <time className="w-28 shrink-0 text-xs text-muted">{format(e.createdAt, "MMM d, h:mm a")}</time>
                <div>
                  <p>
                    <span className="font-medium">{e.actor.name}</span> <span className="text-xs text-muted">({ROLE_LABEL[e.actor.role]})</span> {e.action}
                  </p>
                  {note && <p className="mt-0.5 text-xs text-muted">&ldquo;{note}&rdquo;</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
