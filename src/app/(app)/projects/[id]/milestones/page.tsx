import type { Metadata } from "next";
import { format } from "date-fns";
import { Check } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getProjectForUser } from "@/lib/access";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { nextMilestoneStatus, type MilestoneAction } from "@/lib/workflow";
import { Card, CardHeader, EmptyState, Field, Input, Textarea, cn } from "@/components/ui";
import { StatusBadge } from "@/components/status";
import { ActionForm } from "@/components/action-form";
import { MilestoneActions } from "@/components/milestone-actions";
import { addMilestone } from "@/app/actions/projects";
import { transitionMilestone } from "@/app/actions/milestones";

export const metadata: Metadata = { title: "Milestones" };

const STEPS = ["SUBMITTED", "PASSED", "SIGNED_OFF"] as const;

export default async function MilestonesPage({ params }: PageProps<"/projects/[id]/milestones">) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProjectForUser(user, id);
  const milestones = await db.milestone.findMany({ where: { projectId: project.id }, include: { photos: true }, orderBy: [{ sortOrder: "asc" }, { dueDate: "asc" }] });
  const currency = user.company.currency;
  const released = milestones.filter((m) => m.status === "SIGNED_OFF").reduce((s, m) => s + m.paymentAmount, 0);
  const total = milestones.reduce((s, m) => s + m.paymentAmount, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <p className="text-sm text-muted">
          {formatMoney(released, currency)} of {formatMoney(total, currency)} in milestone payments released. Each milestone needs contractor evidence, manager inspection and owner sign-off.
        </p>
        {milestones.length === 0 && (
          <Card>
            <EmptyState title="No milestones yet" body="Add milestones to tie payments to verified work." />
          </Card>
        )}
        {milestones.map((m, i) => {
          const options = (["submit", "pass", "reject", "signOff"] as MilestoneAction[]).filter((a) => nextMilestoneStatus(m.status, a, user.role).ok);
          const reached = m.status === "REJECTED" || m.status === "OPEN" ? -1 : STEPS.indexOf(m.status as (typeof STEPS)[number]);
          const overdue = m.status !== "SIGNED_OFF" && m.dueDate < new Date();
          return (
            <Card key={m.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted">Milestone {i + 1}</p>
                  <h3 className="font-display text-lg font-semibold">{m.title}</h3>
                  {m.description && <p className="mt-1 text-sm text-muted">{m.description}</p>}
                </div>
                <div className="text-right">
                  <StatusBadge status={m.status} />
                  <p className={cn("mt-1 text-xs", overdue ? "font-medium text-bad" : "text-muted")}>
                    {overdue ? "Overdue · " : "Due "}
                    {format(m.dueDate, "MMM d, yyyy")}
                  </p>
                  <p className="text-sm font-semibold">{formatMoney(m.paymentAmount, currency)}</p>
                </div>
              </div>

              <ol className="mt-4 grid grid-cols-3 gap-2 text-xs">
                {["Contractor submits", "Manager inspects", "Owner signs off"].map((label, step) => (
                  <li key={label} className="flex items-center gap-2">
                    <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", step <= reached ? "border-ok bg-ok text-white" : "border-line text-muted")}>
                      {step <= reached ? <Check className="h-3 w-3" /> : step + 1}
                    </span>
                    <span className={step <= reached ? "font-medium" : "text-muted"}>{label}</span>
                  </li>
                ))}
              </ol>

              {m.submittedNote && <p className="mt-3 text-sm"><span className="font-medium">Contractor:</span> {m.submittedNote}</p>}
              {m.reviewNote && (
                <p className={cn("mt-1 text-sm", m.status === "REJECTED" && "text-bad")}>
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
              <MilestoneActions action={transitionMilestone.bind(null, project.id, m.id)} options={options} />
            </Card>
          );
        })}
      </div>
      {can.manageProject(user.role) && (
        <Card className="self-start">
          <CardHeader title="Add milestone" />
          <div className="p-5">
            <ActionForm action={addMilestone.bind(null, project.id)} submitLabel="Add milestone">
              <Field label="Title">
                <Input name="title" placeholder="Roof structure complete" required />
              </Field>
              <Field label="Description">
                <Textarea name="description" rows={2} />
              </Field>
              <Field label="Due date">
                <Input name="dueDate" type="date" required />
              </Field>
              <Field label={`Payment on sign-off (${currency})`}>
                <Input name="payment" inputMode="decimal" placeholder="25000" />
              </Field>
            </ActionForm>
          </div>
        </Card>
      )}
    </div>
  );
}
