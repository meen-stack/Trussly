import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getProjectForUser } from "@/lib/access";
import { db } from "@/lib/db";
import { can, ROLE_LABEL } from "@/lib/permissions";
import { Badge, Card, CardHeader, Select } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { addMember, removeMember } from "@/app/actions/projects";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage({ params }: PageProps<"/projects/[id]/team">) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProjectForUser(user, id);
  const members = await db.projectMember.findMany({ where: { projectId: project.id }, include: { user: true }, orderBy: { user: { role: "asc" } } });
  const memberIds = new Set(members.map((m) => m.userId));
  const others = await db.user.findMany({ where: { companyId: user.companyId, id: { notIn: [...memberIds] } }, orderBy: { name: "asc" } });
  const manage = can.manageProject(user.role);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Project team" subtitle="Owners and admins can see every project automatically." />
        <ul className="divide-y divide-line">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-5 py-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-steel text-sm font-semibold text-white">
                {m.user.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{m.user.name}</p>
                <p className="truncate text-xs text-muted">{m.user.email}</p>
              </div>
              <Badge>{ROLE_LABEL[m.user.role]}</Badge>
              {manage && m.userId !== user.id && (
                <form action={removeMember.bind(null, project.id)}>
                  <input type="hidden" name="userId" value={m.userId} />
                  <button className="text-xs text-muted hover:text-bad">Remove</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </Card>
      {manage && (
        <Card className="self-start">
          <CardHeader title="Add someone" subtitle="Invite new people from the Team page first." />
          <div className="p-5">
            {others.length === 0 ? (
              <p className="text-sm text-muted">Everyone in your company is already on this project.</p>
            ) : (
              <ActionForm action={addMember.bind(null, project.id)} submitLabel="Add to project">
                <Select name="userId" required>
                  {others.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} · {ROLE_LABEL[o.role]}
                    </option>
                  ))}
                </Select>
              </ActionForm>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
