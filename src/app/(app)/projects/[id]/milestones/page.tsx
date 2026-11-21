import type { Metadata } from "next";
import { format } from "date-fns";
import { Check, User } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getProjectForUser } from "@/lib/access";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { workOptions } from "@/lib/workflow";
import { paidOf } from "@/lib/status";
import { Card, CardHeader, EmptyState, Field, Input, Select, Textarea, cn } from "@/components/ui";
import { WorkBadge, WorkPaymentBadge } from "@/components/status";
import { ActionForm } from "@/components/action-form";
import { WorkActions } from "@/components/work-actions";
import { addMilestone } from "@/app/actions/projects";
import { transitionWork } from "@/app/actions/milestones";

export const metadata: Metadata = { title: "Work" };

/** How far along the verification chain each status has got. */
const REACHED: Record<string, number> = { NOT_STARTED: -1, IN_PROGRESS: -1, CORRECTIONS: -1, REJECTED: -1, SUBMITTED: 0, INSPECTED: 1, AWAITING_OWNER: 2, VERIFIED: 4 };

export default async function WorkPage({ params }: PageProps<"/projects/[id]/milestones">) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProjectForUser(user, id);
  const { currency, approvalThreshold: threshold } = user.company;
  const [work, contractors] = await Promise.all([
    db.milestone.findMany({
      where: { projectId: project.id },
      include: { photos: true, assignee: { select: { name: true, title: true } }, invoices: { include: { payments: true }, orderBy: { createdAt: "asc" } } },
      orderBy: [{ sortOrder: "asc" }, { dueDate: "asc" }],
    }),
    db.user.findMany({ where: { role: "CONTRACTOR", memberships: { some: { projectId: project.id } } }, orderBy: { name: "asc" } }),
  ]);
  const verified = work.filter((m) => m.status === "VERIFIED").reduce((s, m) => s + m.paymentAmount, 0);
  const total = work.reduce((s, m) => s + m.paymentAmount, 0);
  const paid = work.flatMap((m) => m.invoices).reduce((s, i) => s + paidOf(i), 0);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <p className="text-sm text-muted">
          {formatMoney(verified, currency)} of {formatMoney(total, currency)} of work verified, {formatMoney(paid, currency)} paid. Work and payment are tracked separately: work is verified by the site supervisor and manager
          {` (and the owner above ${formatMoney(threshold, currency)})`}, and only verified work can be invoiced for approval.
        </p>
        {work.length === 0 && (
          <Card>
            <EmptyState title="No work yet" body="Add work packages and milestones, assign them to contractors and tie them to payments." />
          </Card>
        )}
        {work.map((m, i) => {
          const mine = user.role !== "CONTRACTOR" || !m.assigneeId || m.assigneeId === user.id;
          const options = mine ? workOptions(m.status, user.role, m.paymentAmount, threshold) : [];
          const reached = REACHED[m.status];
          const needsOwner = m.paymentAmount > threshold;
          const steps = ["Submitted with photos", "Supervisor inspected", "Manager approved", ...(needsOwner ? ["Owner approved"] : []), "Verified"];
          const done = (step: number) => (m.status === "VERIFIED" ? true : step <= reached && step < steps.length - 1);
          const overdue = m.status !== "VERIFIED" && m.status !== "REJECTED" && m.dueDate < new Date();
          return (
            <Card key={m.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted">Work {i + 1}</p>
                  <h3 className="font-display text-lg font-semibold">{m.title}</h3>
                  {m.description && <p className="mt-1 text-sm text-muted">{m.description}</p>}
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                    <User className="h-3.5 w-3.5" />
                    {m.assignee ? `${m.assignee.name}${m.assignee.title ? `, ${m.assignee.title}` : ""}` : "Unassigned"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatMoney(m.paymentAmount, currency)}</p>
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
                    <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", done(step) ? "border-ok bg-ok text-white" : "border-line text-muted")}>
                      {done(step) ? <Check className="h-3 w-3" /> : step + 1}
                    </span>
                    <span className={done(step) ? "font-medium" : "text-muted"}>{label}</span>
                  </li>
                ))}
              </ol>

              {m.submittedNote && <p className="mt-3 text-sm"><span className="font-medium">Contractor:</span> {m.submittedNote}</p>}
              {m.inspectNote && (
                <p className={cn("mt-1 text-sm", m.status === "CORRECTIONS" && !m.reviewNote && "text-bad")}>
                  <span className="font-medium">Inspection:</span> {m.inspectNote}
                </p>
              )}
              {m.reviewNote && (
                <p className={cn("mt-1 text-sm", (m.status === "CORRECTIONS" || m.status === "REJECTED") && "text-bad")}>
                  <span className="font-medium">Review:</span> {m.reviewNote}
                </p>
              )}
              {m.photos.length > 0 && (
                <div className="mt-3 flex gap-2 overflow-x-auto">
                  {m.photos.map((p) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={p.id} src={p.url} alt="" className="h-20 w-28 shrink-0 rounded-md object-cover" />
                  ))}
                </div>
              )}
              <WorkActions action={transitionWork.bind(null, project.id, m.id)} options={options} />
            </Card>
          );
        })}
      </div>
      {can.manageProject(user.role) && (
        <Card className="self-start">
          <CardHeader title="Add work" subtitle="A work package or milestone, tied to a payment." />
          <div className="p-5">
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
              <Field label={`Value (${currency})`} hint={`Over ${formatMoney(threshold, currency)} needs the owner's final approval.`}>
                <Input name="payment" inputMode="decimal" placeholder="25000" />
              </Field>
            </ActionForm>
          </div>
        </Card>
      )}
    </div>
  );
}
