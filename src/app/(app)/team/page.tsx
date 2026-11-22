import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, ROLE_LABEL } from "@/lib/permissions";
import { Badge, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { InviteActions } from "@/components/invite-actions";
import { appUrl, emailConfigured } from "@/lib/email";
import { inviteUser } from "@/app/actions/auth";
import { startDirect } from "@/app/actions/messages";
import { scorecard } from "@/lib/commercial";
import { MessageCircle, Star } from "lucide-react";

export const metadata: Metadata = { title: "Team" };

export default async function CompanyTeamPage() {
  const user = await requireUser();
  const people = await db.user.findMany({
    where: { companyId: user.companyId },
    include: {
      _count: { select: { memberships: true } },
      ratings: { select: { quality: true, timeliness: true, safety: true } },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  const invites = await db.invite.findMany({
    where: {
      companyId: user.companyId,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  return (
    <>
      <PageHeader title="Team" subtitle={`${people.length} people at ${user.company.name}`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <ul className="divide-y divide-line">
            {people.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand-text">
                  {p.name
                    .split(" ")
                    .map((x) => x[0])
                    .slice(0, 2)
                    .join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted">{p.email}</p>
                </div>
                {(() => {
                  const sc = scorecard(p.ratings);
                  return sc ? (
                    <span
                      className="flex items-center gap-1 text-xs font-medium"
                      title={`Quality ${sc.quality.toFixed(1)} · Timeliness ${sc.timeliness.toFixed(1)} · Safety ${sc.safety.toFixed(1)} from ${sc.count} rating${sc.count === 1 ? "" : "s"}`}
                    >
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
            <div className="border-t border-line px-5 py-3">
              <p className="text-xs font-medium tracking-wide text-muted uppercase">Pending invites</p>
              <ul className="mt-2 space-y-2">
                {invites.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">
                      {i.email} <span className="text-xs text-muted">· {ROLE_LABEL[i.role]}</span>
                    </span>
                    {can.inviteUsers(user.role) && <InviteActions inviteId={i.id} link={appUrl(`/invite/${i.token}`)} />}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
        {can.inviteUsers(user.role) && (
          <Card className="self-start">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 font-display font-semibold [&::-webkit-details-marker]:hidden">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-lg leading-none text-brand-ink transition-transform group-open:rotate-45">
                  +
                </span>
                Invite someone
              </summary>
              <div className="border-t border-line p-5">
                {!emailConfigured && (
                  <p className="mb-4 rounded-lg border border-brand/30 bg-brand-soft px-3 py-2 text-xs text-brand-text">Email isn&apos;t set up. Copy the link after inviting.</p>
                )}
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
            </details>
          </Card>
        )}
      </div>
    </>
  );
}
