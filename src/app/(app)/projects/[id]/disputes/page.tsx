import type { Metadata } from "next";
import { format } from "date-fns";
import { requireUser } from "@/lib/auth";
import { getProjectForUser } from "@/lib/access";
import { disputeScope } from "@/lib/scope";
import { db } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { disputeAction } from "@/lib/commercial";
import { Badge, Button, Card, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { ButtonsForm } from "@/components/decision-form";
import { raiseDispute, replyDispute } from "@/app/actions/records";

export const metadata: Metadata = { title: "Disputes" };

const STATUS = {
  OPEN: ["Open", "warn"],
  ESCALATED: ["With the owner", "bad"],
  RESOLVED: ["Resolved", "ok"],
} as const;

export default async function DisputesPage({ params }: PageProps<"/projects/[id]/disputes">) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProjectForUser(user, id);
  const currency = user.company.currency;
  const [disputes, work, invoices] = await Promise.all([
    db.dispute.findMany({
      where: { projectId: project.id, ...disputeScope(user) },
      include: {
        raisedBy: true,
        resolvedBy: true,
        milestone: true,
        expense: true,
        messages: { include: { author: true }, orderBy: { createdAt: "asc" } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    db.milestone.findMany({
      where: {
        projectId: project.id,
        ...(user.role === "CONTRACTOR" && { assigneeId: user.id }),
      },
      orderBy: { sortOrder: "asc" },
    }),
    db.expense.findMany({
      where: {
        budgetLine: { projectId: project.id },
        ...(user.role === "CONTRACTOR" && { submitterId: user.id }),
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {disputes.length === 0 && (
          <Card>
            <EmptyState title="No disputes" />
          </Card>
        )}
        {disputes.map((d) => {
          const [label, tone] = STATUS[d.status];
          const canEscalate = disputeAction(d.status, "escalate", user.role).ok;
          const canResolve = disputeAction(d.status, "resolve", user.role).ok;
          return (
            <Card key={d.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted">
                    {d.milestone
                      ? `Work: ${d.milestone.title}`
                      : d.expense
                        ? `Invoice: ${d.expense.vendor}, ${formatMoney(d.expense.amount, currency)}`
                        : "General"}
                    {d.amount ? ` · ${formatMoney(d.amount, currency)} in dispute` : ""}
                  </p>
                  <h3 className="font-display text-lg font-semibold">{d.title}</h3>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge tone={tone}>{label}</Badge>
                  {d.expense && d.status !== "RESOLVED" && <Badge tone="bad">Payment on hold</Badge>}
                </div>
              </div>
              <ol className="mt-3 space-y-3 border-l-2 border-line pl-4">
                {d.messages.map((m) => (
                  <li key={m.id} className="text-sm">
                    <p className="text-xs text-muted">
                      <span className="font-medium text-ink">{m.author.name}</span> ({ROLE_LABEL[m.author.role]}) · {format(m.createdAt, "MMM d, h:mm a")}
                    </p>
                    <p className="mt-0.5 whitespace-pre-line">{m.body}</p>
                  </li>
                ))}
              </ol>
              {d.status === "RESOLVED" && d.resolvedBy && (
                <p className="mt-3 rounded-lg border border-ok/20 bg-ok/5 px-3 py-2 text-sm">
                  Resolved by {d.resolvedBy.name} on {format(d.resolvedAt!, "MMM d, yyyy")}.
                </p>
              )}
              {d.status !== "RESOLVED" && (
                <ButtonsForm action={replyDispute.bind(null, project.id, d.id)}>
                  <Textarea name="body" rows={2} placeholder={canResolve ? "Reply, or write the resolution" : "Reply"} />
                  <div className="flex flex-wrap gap-2">
                    <Button name="action" value="reply" variant="secondary">
                      Reply
                    </Button>
                    {canEscalate && (
                      <Button name="action" value="escalate" variant="danger">
                        Escalate to owner
                      </Button>
                    )}
                    {canResolve && (
                      <Button name="action" value="resolve" variant="success">
                        Resolve
                      </Button>
                    )}
                  </div>
                </ButtonsForm>
              )}
            </Card>
          );
        })}
      </div>

      {user.role !== "FINANCE" && (
        <Card className="self-start">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 font-display font-semibold [&::-webkit-details-marker]:hidden">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-lg leading-none text-brand-ink transition-transform group-open:rotate-45">
                +
              </span>
              Raise a dispute
            </summary>
            <div className="border-t border-line p-5">
              <ActionForm action={raiseDispute.bind(null, project.id)} submitLabel="Raise dispute">
                <Field label="Title">
                  <Input name="title" placeholder="Slab finish not to spec" required />
                </Field>
                <Field label="About">
                  <Select name="about" defaultValue="">
                    <option value="">General</option>
                    <optgroup label="Work">
                      {work.map((m) => (
                        <option key={m.id} value={`work:${m.id}`}>
                          {m.title}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Invoices">
                      {invoices.map((e) => (
                        <option key={e.id} value={`invoice:${e.id}`}>
                          {e.vendor}, {formatMoney(e.amount, currency)}
                        </option>
                      ))}
                    </optgroup>
                  </Select>
                </Field>
                <Field label={`Amount in dispute (${currency}, optional)`}>
                  <Input name="amount" inputMode="decimal" />
                </Field>
                <Field label="What's the issue?">
                  <Textarea name="body" rows={3} required />
                </Field>
              </ActionForm>
            </div>
          </details>
        </Card>
      )}
    </div>
  );
}
