-- Who did each step of work verification
ALTER TABLE "Milestone" ADD COLUMN "submittedById" TEXT;
ALTER TABLE "Milestone" ADD COLUMN "inspectedById" TEXT;
ALTER TABLE "Milestone" ADD COLUMN "approvedById" TEXT;
ALTER TABLE "Milestone" ADD COLUMN "decidedById" TEXT;

-- Who decided an invoice
ALTER TABLE "Expense" ADD COLUMN "decidedById" TEXT;

-- Account protection
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "failedLogins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lockedUntil" TIMESTAMP(3);

-- The audit trail outlives the people in it
ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_actorId_fkey";
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
