import Link from "next/link";
import { format } from "date-fns";
import { FileText } from "lucide-react";
import type { BudgetLine as Budgetline, Milestone, Payment, Expense, Project, User, Role } from "@prisma/client";
import { formatMoney } from "@/lib/money";
import { nextInvoiceStatus } from "@/lib/workflow";
import { balanceOf, paidOf } from "@/lib/status";
import { decideExpense, payExpense } from "@/app/actions/expenses";
import { EmptyState, cn } from "./ui";
import { PaymentBadge, WorkBadge } from "./status";
import { InvoiceActions, type InvoiceOption } from "./invoice-actions";

export type InvoiceRow = Expense & {
  budgetLine: Budgetline & { project: Pick<Project, "id" | "name"> };
  milestone: Milestone | null;
  submitter: Pick<User, "name">;
  payments: Payment[];
};

const OPTIONS: InvoiceOption[] = ["approve", "reject", "process", "pay", "rejectPayment"];

/** Invoices with their work status, payment status and the actions this user can take. */
export function InvoiceTable({ rows, role, currency, threshold, showProject = false }: { rows: InvoiceRow[]; role: Role; currency: string; threshold: number; showProject?: boolean }) {
  if (rows.length === 0) return <EmptyState title="No invoices yet" />;
  return (
    <ul className="divide-y divide-line">
      {rows.map((e) => {
        const options = OPTIONS.filter((a) => nextInvoiceStatus(e.status, a, role, { amount: e.amount, threshold, workStatus: e.milestone?.status }).ok);
        const paid = paidOf(e);
        const balance = balanceOf(e);
        const blocked = e.status === "SUBMITTED" && role === "MANAGER" && e.milestone && e.milestone.status !== "VERIFIED";
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
                  {e.retention > 0 && ` · Retention held ${formatMoney(e.retention, currency)}`}
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
              {e.reviewNote && <p className={cn("mt-1 text-xs", e.status.includes("REJECTED") && "text-bad")}>Note: {e.reviewNote}</p>}
              {blocked && <p className="mt-1 text-xs font-medium text-warn">Can be approved once the work is verified.</p>}
            </div>
            <div className="sm:text-right">
              <PaymentBadge invoice={e} />
              {e.dueDate && balance > 0 && !e.status.includes("REJECTED") && <p className="mt-1 text-xs text-muted">Due {format(e.dueDate, "MMM d, yyyy")}</p>}
              <InvoiceActions
                decide={decideExpense.bind(null, e.budgetLine.projectId, e.id)}
                pay={payExpense.bind(null, e.budgetLine.projectId, e.id)}
                options={options}
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
} as const;
