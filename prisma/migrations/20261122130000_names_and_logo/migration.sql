-- CreateTable
CREATE TABLE "NameChange" (
    "id" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "toName" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NameChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NameChange_subjectType_subjectId_createdAt_idx" ON "NameChange"("subjectType", "subjectId", "createdAt");

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "logoUrl" TEXT;

