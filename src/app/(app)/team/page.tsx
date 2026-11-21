import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, ROLE_LABEL } from "@/lib/permissions";
import { Badge, Card, CardHeader, Field, Input, PageHeader, Select } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { inviteUser } from "@/app/actions/auth";
import { startDirect } from "@/app/actions/messages";
import { scorecard } from "@/lib/commercial";
import { MessageCircle, Star } from "lucide-react";

export const metadata: Metadata = { title: "Team" };

export default async function CompanyTeamPage() {
  const user = await requireUser();
  const people = await db.user.findMany({
    where: { companyId: user.companyId },
    include: { _count: { select: { memberships: true } }, ratings: { select: { quality: true, timeliness: true, safety: true } } },
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
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand-text">
                  {p.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted">{p.email}</p>
                </div>
                {(() => {
                  const sc = scorecard(p.ratings);
                  return sc ? (
                    <span className="flex items-center gap-1 text-xs font-medium" title={`Quality ${sc.quality.toFixed(1)} · Timeliness ${sc.timeliness.toFixed(1)} · Safety ${sc.safety.toFixed(1)} from ${sc.count} rating${sc.count === 1 ? "" : "s"}`}>
                      <Star className="h-3.5 w-3.5 fill-brand text-brand" /> {sc.overall.toFixed(1)}
                    </span>
                  ) : null;
                })()}
                <span className="hidden text-xs text-muted sm:block">{p._count.memberships} projects</span>
                <Badge>{ROLE_LABEL[p.role]}</Badge>
                {p.id !== user.id && (
                  <form action={startDirect}>
                    <input type="hidden" name="userId" value={p.id} />
                    <button className="rounded-lg p-2 text-muted hover:bg-bg hover:text-ink" title={`Message ${p.name}`} aria-label={`Message ${p.name}`}>
                      <MessageCircle className="h-4 w-4" />
                    </button>
                  </form>
                )}
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
                    {(["MANAGER", "SUPERVISOR", "CONTRACTOR", "FINANCE", "OWNER", "ADMIN"] as const).map((r) => (
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
