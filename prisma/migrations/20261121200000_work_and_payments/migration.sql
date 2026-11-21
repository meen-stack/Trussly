-- Separate tracks for work verification and invoice payment.

-- Roles
ALTER TYPE "Role" ADD VALUE 'FINANCE';

-- Work status: map the old milestone statuses onto the new verification chain.
CREATE TYPE "MilestoneStatus_new" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'INSPECTED', 'AWAITING_OWNER', 'CORRECTIONS', 'VERIFIED', 'REJECTED');
ALTER TABLE "Milestone" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Milestone" ALTER COLUMN "status" TYPE "MilestoneStatus_new" USING (
  CASE "status"::text
    WHEN 'OPEN' THEN 'NOT_STARTED'
    WHEN 'SUBMITTED' THEN 'SUBMITTED'
    WHEN 'PASSED' THEN 'AWAITING_OWNER'
    WHEN 'SIGNED_OFF' THEN 'VERIFIED'
    WHEN 'REJECTED' THEN 'CORRECTIONS'
  END
)::"MilestoneStatus_new";
DROP TYPE "MilestoneStatus";
ALTER TYPE "MilestoneStatus_new" RENAME TO "MilestoneStatus";
ALTER TABLE "Milestone" ALTER COLUMN "status" SET DEFAULT 'NOT_STARTED';

ALTER TABLE "Milestone" RENAME COLUMN "passedAt" TO "approvedAt";
ALTER TABLE "Milestone" RENAME COLUMN "signedOffAt" TO "verifiedAt";
ALTER TABLE "Milestone"
  ADD COLUMN "assigneeId" TEXT,
  ADD COLUMN "inspectNote" TEXT,
  ADD COLUMN "inspectedAt" TIMESTAMP(3),
  ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Invoice status: approved invoices stay approved (awaiting payment).
CREATE TYPE "ExpenseStatus_new" AS ENUM ('SUBMITTED', 'OWNER_REVIEW', 'APPROVED', 'PROCESSING', 'PAID', 'REJECTED', 'PAYMENT_REJECTED');
ALTER TABLE "Expense" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Expense" ALTER COLUMN "status" TYPE "ExpenseStatus_new" USING (
  CASE "status"::text
    WHEN 'PENDING' THEN 'SUBMITTED'
    WHEN 'MANAGER_APPROVED' THEN 'OWNER_REVIEW'
    WHEN 'APPROVED' THEN 'APPROVED'
    WHEN 'REJECTED' THEN 'REJECTED'
  END
)::"ExpenseStatus_new";
DROP TYPE "ExpenseStatus";
ALTER TYPE "ExpenseStatus_new" RENAME TO "ExpenseStatus";
ALTER TABLE "Expense" ALTER COLUMN "status" SET DEFAULT 'SUBMITTED';

ALTER TABLE "Expense"
  ADD COLUMN "dueDate" TIMESTAMP(3),
  ADD COLUMN "milestoneId" TEXT,
  ADD COLUMN "retention" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reference" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT NOT NULL,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Company settings
ALTER TABLE "Company"
  ADD COLUMN "paymentTermsDays" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "retentionPercent" INTEGER NOT NULL DEFAULT 5;

-- Daily report detail
ALTER TABLE "DailyReport"
  ADD COLUMN "equipment" TEXT,
  ADD COLUMN "incidents" TEXT,
  ADD COLUMN "materials" TEXT,
  ADD COLUMN "remarks" TEXT;
