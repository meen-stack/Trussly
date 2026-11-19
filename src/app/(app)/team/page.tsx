import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, ROLE_LABEL } from "@/lib/permissions";
import { Badge, Card, CardHeader, Field, Input, PageHeader, Select } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { inviteUser } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Team" };

export default async function CompanyTeamPage() {
  const user = await requireUser();
  const people = await db.user.findMany({
    where: { companyId: user.companyId },
    include: { _count: { select: { memberships: true } } },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  const invites = await db.invite.findMany({ where: { companyId: user.companyId, usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  return (
    <>
      <PageHeader title="Team" subtitle={`${people.length} people at ${user.company.name}`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <ul className="divide-y divide-line">
            {people.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-steel text-sm font-semibold text-white">
                  {p.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted">{p.email}</p>
                </div>
                <span className="hidden text-xs text-muted sm:block">{p._count.memberships} projects</span>
                <Badge>{ROLE_LABEL[p.role]}</Badge>
              </li>
            ))}
          </ul>
          {invites.length > 0 && (
            <div className="border-t border-line px-5 py-3 text-sm text-muted">
              Pending invites: {invites.map((i) => `${i.email} (${ROLE_LABEL[i.role]})`).join(", ")}
            </div>
          )}
        </Card>
        {can.inviteUsers(user.role) && (
          <Card className="self-start">
            <CardHeader title="Invite someone" subtitle="They'll get an email link valid for 7 days." />
            <div className="p-5">
              <ActionForm action={inviteUser} submitLabel="Send invite" pendingLabel="Sending…">
                <Field label="Email">
                  <Input name="email" type="email" required />
                </Field>
                <Field label="Role">
                  <Select name="role" defaultValue="SUPERVISOR">
                    {(["MANAGER", "SUPERVISOR", "CONTRACTOR", "OWNER", "ADMIN"] as const).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </ActionForm>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
