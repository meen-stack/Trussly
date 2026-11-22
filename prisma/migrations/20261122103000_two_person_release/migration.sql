-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "delegationEndsAt" TIMESTAMP(3),
ADD COLUMN     "ownerDelegateRoles" "Role"[] DEFAULT ARRAY[]::"Role"[],
ADD COLUMN     "twoPersonFrom" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Confirmation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "onBehalfOfOwner" BOOLEAN NOT NULL DEFAULT false,
    "statement" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Confirmation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Confirmation_kind_targetId_idx" ON "Confirmation"("kind", "targetId");

-- AddForeignKey
ALTER TABLE "Confirmation" ADD CONSTRAINT "Confirmation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Confirmation" ADD CONSTRAINT "Confirmation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

