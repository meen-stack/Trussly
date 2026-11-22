import Link from "next/link";
import { format } from "date-fns";
import { Check, FileText } from "lucide-react";
import type { BudgetLine as Budgetline, Milestone, Payment, Expense, Project, User } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { confirmationsFor } from "@/lib/confirmations";
import { actsForOwner, confirmAs } from "@/lib/release";
import { ROLE_LABEL } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { nextInvoiceStatus } from "@/lib/workflow";
import { balanceOf, paidOf } from "@/lib/status";
import { decideExpense, payExpense } from "@/app/actions/expenses";
import { EmptyState, cn } from "./ui";
import { PaymentBadge, WorkBadge } from "./status";
import { InvoiceActions, type InvoiceOption } from "./invoice-actions";
import { blocksPayment } from "@/lib/commercial";

export type InvoiceRow = Expense & {
  budgetLine: Budgetline & { project: Pick<Project, "id" | "name"> };
  milestone: Milestone | null;
  submitter: Pick<User, "name">;
  payments: Payment[];
  disputes: { status: "OPEN" | "ESCALATED" | "RESOLVED" }[];
};

const OPTIONS: InvoiceOption[] = ["approve", "reject", "process", "pay", "rejectPayment"];

/** Invoices with their work status, payment status and the actions this user can take. */
export async function InvoiceTable({ rows, user, showProject = false }: { rows: InvoiceRow[]; user: CurrentUser; showProject?: boolean }) {
  if (rows.length === 0) return <EmptyState title="No invoices yet" />;
  const { currency, approvalThreshold: threshold, twoPersonFrom } = user.company;
  const confirmations = await confirmationsFor("INVOICE", rows.map((r) => r.id));
  return (
    <ul className="divide-y divide-line">
      {rows.map((e) => {
        const onHold = blocksPayment(e.disputes);
        const confirmed = confirmations.filter((c) => c.targetId === e.id);
        // Someone whose role the owner delegated can decide where the owner would.
        const role = e.status === "OWNER_REVIEW" && actsForOwner(user.role, user.company) ? "OWNER" : user.role;
        const canConfirm = confirmAs({ user, company: user.company, amount: e.amount, requesterId: e.submitterId, prior: confirmed, singleOk: () => true }).ok;
        const options = OPTIONS.filter(
          (a) =>
            nextInvoiceStatus(e.status, a, role, { amount: e.amount, threshold, workStatus: e.milestone?.status, twoFrom: twoPersonFrom }).ok &&
            !(onHold && (a === "pay" || a === "process")) &&
            !((a === "approve" || a === "reject") && e.submitterId === user.id) &&
            !(a === "approve" && !canConfirm),
        );
        const paid = paidOf(e);
        const balance = balanceOf(e);
        const blocked = e.status === "SUBMITTED" && user.role === "MANAGER" && e.milestone && e.milestone.status !== "VERIFIED";
        return (
          <li key={e.id} className="grid gap-3 px-5 py-4 text-sm sm:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{formatMoney(e.amount, currency)}</p>
                <span className="text-muted">· {e.vendor}</span>
                {e.invoiceUrl && (
                  <a href={e.invoiceUrl} target="_blank" rel="noreferrer" className="text-muted hover:text-ink" title="View invoice">
                    <FileText className="h-4 w-4" />
                  </a>
                )}
              </div>
              <p className="mt-0.5 text-muted">
                {showProject && (
                  <>
                    <Link href={`/projects/${e.budgetLine.project.id}/budget`} className="font-medium text-ink hover:underline">{e.budgetLine.project.name}</Link>
                    {" · "}
                  </>
                )}
                {e.budgetLine.category} · {e.description} · from {e.submitter.name} · {format(e.createdAt, "MMM d")}
              </p>
              {e.milestone && (
                <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  Work: <span className="font-medium text-ink">{e.milestone.title}</span> <WorkBadge status={e.milestone.status} />
                </p>
              )}
              {(paid > 0 || e.retention > 0) && (
                <p className="mt-1 text-xs text-muted">
                  Paid {formatMoney(paid, currency)} · Balance {formatMoney(Math.max(balance, 0), currency)}
                  {e.retention > 0 && (e.retentionReleasedAt ? ` · Retention of ${formatMoney(e.retention, currency)} released at handover` : ` · Retention held ${formatMoney(e.retention, currency)}`)}
                </p>
              )}
              {e.payments.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-xs text-muted">
                  {e.payments.map((p) => (
                    <li key={p.id}>
                      {format(p.paidAt, "MMM d")}: {formatMoney(p.amount, currency)} paid{p.reference && ` · ref ${p.reference}`}
                    </li>
                  ))}
                </ul>
              )}
              {confirmed.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-xs">
                  {confirmed.map((c) => (
                    <li key={c.id} className="flex items-center gap-1 text-ok">
                      <Check className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        Confirmed by {c.user.name}, {c.onBehalfOfOwner ? "for the owner" : ROLE_LABEL[c.role]} · {format(c.createdAt, "MMM d, h:mm a")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {e.status === "OWNER_REVIEW" && <p className="mt-1 text-xs font-medium text-warn">Waiting for the owner&apos;s confirmation</p>}
              {e.reviewNote && <p className={cn("mt-1 text-xs", e.status.includes("REJECTED") && "text-bad")}>Note: {e.reviewNote}</p>}
              {blocked && <p className="mt-1 text-xs font-medium text-warn">Can be approved once the work is verified.</p>}
              {onHold && (
                <p className="mt-1 text-xs font-medium text-bad">
                  In dispute: payment on hold.{" "}
                  <a href={`/projects/${e.budgetLine.project.id}/disputes`} className="underline">
                    See the dispute
                  </a>
                </p>
              )}
            </div>
            <div className="sm:text-right">
              <PaymentBadge invoice={e} />
              {e.dueDate && balance > 0 && !e.status.includes("REJECTED") && <p className="mt-1 text-xs text-muted">Due {format(e.dueDate, "MMM d, yyyy")}</p>}
              <InvoiceActions
                decide={decideExpense.bind(null, e.budgetLine.projectId, e.id)}
                pay={payExpense.bind(null, e.budgetLine.projectId, e.id)}
                options={options}
                purpose={e.description}
                balance={(balance / 100).toFixed(2)}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Prisma include for InvoiceRow. */
export const invoiceInclude = {
  budgetLine: { include: { project: { select: { id: true, name: true } } } },
  milestone: true,
  submitter: { select: { name: true } },
  payments: { orderBy: { paidAt: "asc" } },
  disputes: { select: { status: true } },
} as const;
