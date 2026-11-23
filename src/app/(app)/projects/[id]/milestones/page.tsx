import type { Metadata } from "next";
import { format } from "date-fns";
import { Check, History, User } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getProjectForUser } from "@/lib/access";
import { invoiceScope } from "@/lib/scope";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { separationError, workOptions, WORK_ACTIONS, nextWorkStatus } from "@/lib/workflow";
import { ROLE_LABEL } from "@/lib/permissions";
import { paidOf } from "@/lib/status";
import { Card, EmptyState, Field, Input, Select, Textarea, cn } from "@/components/ui";
import { WorkBadge, WorkPaymentBadge } from "@/components/status";
import { ActionForm } from "@/components/action-form";
import { WorkActions } from "@/components/work-actions";
import { addMilestone } from "@/app/actions/projects";
import { transitionWork } from "@/app/actions/milestones";
import { rateWork } from "@/app/actions/records";
import { InlineForm } from "@/components/decision-form";
import { ratingScore } from "@/lib/commercial";
import { directUploads } from "@/lib/storage";
import { Media } from "@/components/media";
import { actsForOwner } from "@/lib/release";

export const metadata: Metadata = { title: "Work" };

/** How far along the verification chain each status has got. */
const REACHED: Record<string, number> = {
  NOT_STARTED: -1,
  IN_PROGRESS: -1,
  CORRECTIONS: -1,
  REJECTED: -1,
  SUBMITTED: 0,
  INSPECTED: 1,
  AWAITING_OWNER: 2,
  VERIFIED: 4,
};

export default async function WorkPage({ params }: PageProps<"/projects/[id]/milestones">) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProjectForUser(user, id);
  const { currency, approvalThreshold: threshold } = user.company;
  const finances = can.seeProjectFinances(user.role);
  const [work, contractors, history] = await Promise.all([
    db.milestone.findMany({
      where: { projectId: project.id },
      include: {
        photos: true,
        ratings: true,
        assignee: { select: { name: true, title: true } },
        invoices: {
          where: invoiceScope(user),
          include: { payments: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { dueDate: "asc" }],
    }),
    db.user.findMany({
      where: {
        role: "CONTRACTOR",
        memberships: { some: { projectId: project.id } },
      },
      orderBy: { name: "asc" },
    }),
    // Approval history for each work item: every step, by whom and when.
    db.auditEvent.findMany({
      where: { projectId: project.id, entityType: "Milestone" },
      include: { actor: { select: { name: true, role: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const historyOf = (id: string) => history.filter((e) => e.entityId === id);
  // People who don't see the project's finances only see the value of their own work.
  const showValue = (m: { assigneeId: string | null }) => finances || (user.role === "CONTRACTOR" && m.assigneeId === user.id);
  const counted = work.filter(showValue);
  const verified = counted.filter((m) => m.status === "VERIFIED").reduce((s, m) => s + m.paymentAmount, 0);
  const total = counted.reduce((s, m) => s + m.paymentAmount, 0);
  const paid = counted.flatMap((m) => m.invoices).reduce((s, i) => s + paidOf(i), 0);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {counted.length > 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-ok/10 px-3 py-1 font-medium text-ok">{formatMoney(verified, currency)} verified</span>
          <span className="rounded-full bg-surface px-3 py-1 text-muted ring-1 ring-line">{formatMoney(total, currency)} total</span>
          <span className="rounded-full bg-surface px-3 py-1 text-muted ring-1 ring-line">{formatMoney(paid, currency)} paid</span>
        </div>
        )}
        {work.length === 0 && (
          <Card>
            <EmptyState title="No work yet" />
          </Card>
        )}
        {work.map((m) => {
          const mine = user.role !== "CONTRACTOR" || !m.assigneeId || m.assigneeId === user.id;
          const actingRole = m.status === "AWAITING_OWNER" && actsForOwner(user.role, user.company) ? "OWNER" : user.role;
          const options = mine ? workOptions(m.status, actingRole, m.paymentAmount, threshold, user.id, m) : [];
          // Say why when the role could act but this person did an earlier step.
          const blockedBy =
            mine && options.length === 0
              ? WORK_ACTIONS.filter((a) => nextWorkStatus(m.status, a, actingRole, m.paymentAmount, threshold).ok)
                  .map((a) => separationError(m.status, a, user.id, m))
                  .find(Boolean)
              : null;
          const events = historyOf(m.id);
          const reached = REACHED[m.status];
          const needsOwner = m.paymentAmount > threshold;
          const steps = ["Submitted", "Inspected", "Manager", ...(needsOwner ? ["Owner"] : []), "Verified"];
          const done = (step: number) => (m.status === "VERIFIED" ? true : step <= reached && step < steps.length - 1);
          const overdue = m.status !== "VERIFIED" && m.status !== "REJECTED" && m.dueDate < new Date();
          return (
            <Card key={m.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-display text-lg font-semibold">{m.title}</h3>
                  {m.description && <p className="mt-1 text-sm text-muted">{m.description}</p>}
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                    <User className="h-3.5 w-3.5" />
                    {m.assignee ? `${m.assignee.name}${m.assignee.title ? `, ${m.assignee.title}` : ""}` : "Unassigned"}
                  </p>
                </div>
                <div className="text-right">
                  {showValue(m) && <p className="text-sm font-semibold">{formatMoney(m.paymentAmount, currency)}</p>}
                  <p className={cn("mt-0.5 text-xs", overdue ? "font-medium text-bad" : "text-muted")}>
                    {overdue ? "Overdue · " : "Due "}
                    {format(m.dueDate, "MMM d, yyyy")}
                  </p>
                </div>
              </div>

              <div className="mt-3 grid gap-2 rounded-lg bg-bg p-3 text-xs sm:grid-cols-2">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="w-14 text-muted">Work</span> <WorkBadge status={m.status} invoices={m.invoices} />
                </p>
                <p className="flex flex-wrap items-center gap-2">
                  <span className="w-14 text-muted">Payment</span> <WorkPaymentBadge invoices={m.invoices} />
                </p>
              </div>

              <ol className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs">
                {steps.map((label, step) => (
                  <li key={label} className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                        done(step) ? "border-ok bg-ok text-white" : "border-line text-muted",
                      )}
                    >
                      {done(step) ? <Check className="h-3 w-3" /> : step + 1}
                    </span>
                    <span className={done(step) ? "font-medium" : "text-muted"}>{label}</span>
                  </li>
                ))}
              </ol>

              {m.status !== "VERIFIED" && m.submittedNote && (
                <p className="mt-3 text-sm">
                  <span className="font-medium">Contractor:</span> {m.submittedNote}
                </p>
              )}
              {m.status !== "VERIFIED" && m.inspectNote && (
                <p className={cn("mt-1 text-sm", m.status === "CORRECTIONS" && !m.reviewNote && "text-bad")}>
                  <span className="font-medium">Inspection:</span> {m.inspectNote}
                </p>
              )}
              {m.status !== "VERIFIED" && m.reviewNote && (
                <p className={cn("mt-1 text-sm", (m.status === "CORRECTIONS" || m.status === "REJECTED") && "text-bad")}>
                  <span className="font-medium">Review:</span> {m.reviewNote}
                </p>
              )}
              {m.photos.length > 0 && (
                <div className="mt-3 flex gap-2 overflow-x-auto">
                  {m.photos.map((p) => (
                    <Media key={p.id} url={p.url} thumb className="h-20 w-28 shrink-0 rounded-md object-cover" />
                  ))}
                </div>
              )}
              <WorkActions action={transitionWork.bind(null, project.id, m.id)} options={options} folder={`projects/${project.id}`} direct={directUploads} />
              {blockedBy && <p className="mt-3 rounded-lg bg-bg px-3 py-2 text-xs text-muted">{blockedBy}</p>}
              {events.length > 0 && (
                <details className="mt-3 text-sm">
                  <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted">
                    <History className="h-3.5 w-3.5" /> History ({events.length})
                  </summary>
                  <ol className="mt-2 space-y-1.5 border-l-2 border-line pl-3 text-xs">
                    {events.map((e) => {
                      const note = (e.detail as { note?: string } | null)?.note;
                      return (
                        <li key={e.id}>
                          <span className="text-muted">{format(e.createdAt, "MMM d, h:mm a")} · </span>
                          <span className="font-medium">{e.actor.name}</span> <span className="text-muted">({ROLE_LABEL[e.actor.role]})</span> {e.action}
                          {note && <span className="block text-muted">&ldquo;{note}&rdquo;</span>}
                        </li>
                      );
                    })}
                  </ol>
                </details>
              )}
              {m.ratings[0] && (
                <p className="mt-3 text-sm">
                  <span className="font-medium">Rating {ratingScore(m.ratings[0]).toFixed(1)}/5</span>
                  <span className="text-muted">
                    {" "}
                    · quality {m.ratings[0].quality}, timeliness {m.ratings[0].timeliness}, safety {m.ratings[0].safety}
                    {m.ratings[0].comment ? ` · "${m.ratings[0].comment}"` : ""}
                  </span>
                </p>
              )}
              {m.status === "VERIFIED" && m.assigneeId && !m.ratings[0] && can.rate(user.role) && (
                <details className="mt-3 rounded-lg border border-line bg-bg p-3 text-sm">
                  <summary className="cursor-pointer font-medium">Rate {m.assignee?.name ?? "the contractor"}</summary>
                  <InlineForm action={rateWork.bind(null, project.id, m.id)} submitLabel="Save rating">
                    <div className="grid grid-cols-3 gap-2">
                      {(["quality", "timeliness", "safety"] as const).map((k) => (
                        <label key={k} className="space-y-1 text-xs capitalize">
                          {k}
                          <Select name={k} defaultValue="4">
                            {[5, 4, 3, 2, 1].map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </Select>
                        </label>
                      ))}
                    </div>
                    <Input name="comment" placeholder="Comment (optional)" />
                  </InlineForm>
                </details>
              )}
            </Card>
          );
        })}
      </div>
      {can.manageProject(user.role) && (
        <Card className="self-start">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 font-display font-semibold [&::-webkit-details-marker]:hidden">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-lg leading-none text-brand-ink transition-transform group-open:rotate-45">
                +
              </span>
              Add work
            </summary>
            <div className="border-t border-line p-5">
              <ActionForm action={addMilestone.bind(null, project.id)} submitLabel="Add work">
                <Field label="Title">
                  <Input name="title" placeholder="Roof structure complete" required />
                </Field>
                <Field label="Description">
                  <Textarea name="description" rows={2} />
                </Field>
                <Field label="Assigned contractor">
                  <Select name="assigneeId" defaultValue="">
                    <option value="">Unassigned</option>
                    {contractors.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.title ? `, ${c.title}` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Deadline">
                  <Input name="dueDate" type="date" required />
                </Field>
                <Field label={`Value (${currency})`}>
                  <Input name="payment" inputMode="decimal" placeholder="25000" />
                </Field>
              </ActionForm>
            </div>
          </details>
        </Card>
      )}
    </div>
  );
}
