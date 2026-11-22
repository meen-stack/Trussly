import type { Metadata } from "next";
import { format } from "date-fns";
import { PenLine } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getProjectForUser } from "@/lib/access";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { ROLE_LABEL } from "@/lib/permissions";
import { canDecideChange, canProposeChange, originalBudget } from "@/lib/commercial";
import { shortPrint } from "@/lib/signature";
import { Badge, Card, EmptyState, Field, Input, Select, Stat, Textarea } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { DecisionForm } from "@/components/decision-form";
import { decideChangeOrder, proposeChange } from "@/app/actions/changes";

export const metadata: Metadata = { title: "Change orders" };

const TONE = { PROPOSED: "warn", APPROVED: "ok", REJECTED: "bad" } as const;
const LABEL = {
  PROPOSED: "Awaiting decision",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export default async function ChangesPage({ params }: PageProps<"/projects/[id]/changes">) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProjectForUser(user, id);
  const { currency, approvalThreshold: threshold } = user.company;
  const [changes, lines, work] = await Promise.all([
    db.changeOrder.findMany({
      where: { projectId: project.id },
      include: {
        budgetLine: true,
        milestone: true,
        requestedBy: true,
        decidedBy: true,
        signatures: true,
      },
      orderBy: { number: "desc" },
    }),
    db.budgetLine.findMany({
      where: { projectId: project.id },
      include: { changeOrders: true },
      orderBy: { category: "asc" },
    }),
    db.milestone.findMany({
      where: {
        projectId: project.id,
        status: { not: "REJECTED" },
        ...(user.role === "CONTRACTOR" && { assigneeId: user.id }),
      },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  const approved = changes.filter((c) => c.status === "APPROVED");
  const net = approved.reduce((s, c) => s + c.amount, 0);
  const days = approved.reduce((s, c) => s + c.daysImpact, 0);
  const original = lines.reduce((s, l) => s + originalBudget(l.budgeted, l.changeOrders), 0);
  const pending = changes.filter((c) => c.status === "PROPOSED");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Original budget" value={formatMoney(original, currency)} />
        <Stat
          label="Approved changes"
          value={`${net >= 0 ? "+" : ""}${formatMoney(net, currency)}`}
          sub={`${approved.length} change order${approved.length === 1 ? "" : "s"}`}
          tone={net > 0 ? "warn" : undefined}
        />
        <Stat
          label="Revised budget"
          value={formatMoney(original + net, currency)}
          sub={original ? `${((net / original) * 100).toFixed(1)}% change` : undefined}
        />
        <Stat label="Schedule impact" value={`${days >= 0 ? "+" : ""}${days} days`} sub={`${pending.length} awaiting a decision`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {changes.length === 0 && (
            <Card>
              <EmptyState title="No change orders" />
            </Card>
          )}
          {changes.map((c) => {
            const sig = c.signatures[0];
            const decide = c.status === "PROPOSED" && canDecideChange(user.role, c.amount, threshold);
            const needsOwner = Math.abs(c.amount) > threshold;
            return (
              <Card key={c.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted">
                      CO-{c.number} · {c.budgetLine.category}
                      {c.milestone ? ` · ${c.milestone.title}` : ""}
                    </p>
                    <h3 className="font-display text-lg font-semibold">{c.title}</h3>
                  </div>
                  <div className="text-right">
                    <p className={c.amount < 0 ? "font-semibold text-ok" : "font-semibold"}>
                      {c.amount >= 0 ? "+" : ""}
                      {formatMoney(c.amount, currency)}
                    </p>
                    {c.daysImpact !== 0 && (
                      <p className="text-xs text-muted">
                        {c.daysImpact > 0 ? "+" : ""}
                        {c.daysImpact} days
                      </p>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-sm">{c.reason}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <Badge tone={TONE[c.status]}>{LABEL[c.status]}</Badge>
                  {c.status === "PROPOSED" && needsOwner && <Badge tone="brand">Owner decides</Badge>}
                  <span>
                    Proposed by {c.requestedBy.name} ({ROLE_LABEL[c.requestedBy.role]}), {format(c.createdAt, "MMM d")}
                  </span>
                </div>
                {c.decisionNote && (
                  <p className="mt-2 text-sm">
                    <span className="font-medium">{c.decidedBy?.name}:</span> {c.decisionNote}
                  </p>
                )}
                {sig && (
                  <div className="mt-3 flex items-center gap-3 rounded-lg border border-ok/20 bg-ok/5 px-3 py-2 text-xs">
                    <PenLine className="h-4 w-4 shrink-0 text-ok" />
                    <div>
                      <p>
                        <span className="font-display text-sm italic">{sig.signedName}</span> · {ROLE_LABEL[sig.role]} ·{" "}
                        {format(sig.signedAt, "MMM d, yyyy h:mm a")}
                      </p>
                      <p className="font-mono text-[11px] text-muted">Fingerprint {shortPrint(sig.fingerprint)}</p>
                    </div>
                  </div>
                )}
                {decide && <DecisionForm action={decideChangeOrder.bind(null, project.id, c.id)} signAs={user.name} approveLabel="Approve and sign" />}
              </Card>
            );
          })}
        </div>

        {canProposeChange(user.role) && (
          <Card className="self-start">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 font-display font-semibold [&::-webkit-details-marker]:hidden">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-lg leading-none text-brand-ink transition-transform group-open:rotate-45">
                  +
                </span>
                Propose a change
              </summary>
              <div className="border-t border-line p-5">
                <ActionForm action={proposeChange.bind(null, project.id)} submitLabel="Propose change order">
                  <Field label="Title">
                    <Input name="title" placeholder="Upgrade roof insulation to R-38" required />
                  </Field>
                  <Field label="Reason">
                    <Textarea name="reason" rows={2} placeholder="Client request after energy review" required />
                  </Field>
                  <Field label={`Cost (${currency})`}>
                    <Input name="amount" inputMode="decimal" placeholder="8500" required />
                  </Field>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="saving" className="accent-[#ffc107]" /> This is a saving (reduces the budget)
                  </label>
                  <Field label="Budget line">
                    <Select name="budgetLineId" required defaultValue="">
                      <option value="" disabled>
                        Choose…
                      </option>
                      {lines.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.category}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Changes this work">
                    <Select name="milestoneId" defaultValue="">
                      <option value="">No specific work</option>
                      {work.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.title}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Schedule impact (days)">
                    <Input name="daysImpact" type="number" defaultValue={0} />
                  </Field>
                </ActionForm>
              </div>
            </details>
          </Card>
        )}
      </div>
    </div>
  );
}
