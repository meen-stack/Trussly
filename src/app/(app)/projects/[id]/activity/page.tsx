import type { Metadata } from "next";
import { format } from "date-fns";
import { Download } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getProjectForUser } from "@/lib/access";
import { db } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/permissions";
import { AUDIT_TYPES, auditWhere, type AuditFilter } from "@/lib/audit-query";
import { Badge, Button, ButtonLink, Card, CardHeader, EmptyState, Input, Select } from "@/components/ui";

export const metadata: Metadata = { title: "Audit trail" };

export default async function ActivityPage({ params, searchParams }: PageProps<"/projects/[id]/activity">) {
  const { id } = await params;
  const raw = (await searchParams) as Record<string, string | undefined>;
  const f: AuditFilter = { type: raw.type || undefined, who: raw.who || undefined, q: raw.q || undefined, from: raw.from || undefined, to: raw.to || undefined };
  const user = await requireUser();
  const project = await getProjectForUser(user, id);
  const [events, people, count] = await Promise.all([
    db.auditEvent.findMany({ where: auditWhere(project.id, f), include: { actor: true }, orderBy: { createdAt: "desc" }, take: 300 }),
    db.user.findMany({ where: { auditEvents: { some: { projectId: project.id } } }, orderBy: { name: "asc" } }),
    db.auditEvent.count({ where: auditWhere(project.id, f) }),
  ]);
  const qs = new URLSearchParams(Object.entries(f).filter((e): e is [string, string] => !!e[1])).toString();
  const filtered = qs.length > 0;

  return (
    <Card>
      <CardHeader
        title="Audit trail"
        subtitle="Every approval, rejection, signature, payment and change, with who did it and when. Entries can't be edited."
        action={
          <ButtonLink href={`/projects/${project.id}/activity/export${qs ? `?${qs}` : ""}`} variant="secondary" prefetch={false}>
            <Download className="h-4 w-4" /> CSV
          </ButtonLink>
        }
      />
      <form className="grid gap-2 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-6">
        <Input name="q" defaultValue={f.q} placeholder="Search actions" className="lg:col-span-2" aria-label="Search" />
        <Select name="type" defaultValue={f.type ?? ""} aria-label="Type">
          <option value="">All types</option>
          {Object.entries(AUDIT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select name="who" defaultValue={f.who ?? ""} aria-label="Person">
          <option value="">Everyone</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Input name="from" type="date" defaultValue={f.from} aria-label="From" />
        <div className="flex gap-2">
          <Input name="to" type="date" defaultValue={f.to} aria-label="To" />
          <Button variant="dark">Filter</Button>
        </div>
      </form>
      {filtered && (
        <p className="border-b border-line px-5 py-2 text-xs text-muted">
          {count} matching entr{count === 1 ? "y" : "ies"} · <a href="?" className="text-brand-text hover:underline">Clear filters</a>
        </p>
      )}
      {events.length === 0 ? (
        <EmptyState title={filtered ? "Nothing matches" : "Nothing recorded yet"} />
      ) : (
        <ol className="divide-y divide-line">
          {events.map((e) => {
            const note = (e.detail as { note?: string } | null)?.note;
            return (
              <li key={e.id} className="flex gap-4 px-5 py-3 text-sm">
                <time className="w-28 shrink-0 text-xs text-muted">{format(e.createdAt, "MMM d, h:mm a")}</time>
                <div className="min-w-0 flex-1">
                  <p>
                    <span className="font-medium">{e.actor.name}</span> <span className="text-xs text-muted">({ROLE_LABEL[e.actor.role]})</span> {e.action}
                  </p>
                  {note && <p className="mt-0.5 text-xs text-muted">&ldquo;{note}&rdquo;</p>}
                </div>
                <span className="hidden shrink-0 sm:block">
                  <Badge>{AUDIT_TYPES[e.entityType] ?? e.entityType}</Badge>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
