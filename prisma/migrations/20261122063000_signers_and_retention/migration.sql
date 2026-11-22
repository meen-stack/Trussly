-- Signatures are owed by named people, not by whoever holds a role.
ALTER TABLE "Document" ADD COLUMN "signerIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Carry existing role requirements over to the people holding those roles on the project
-- (owners count for every project in their company).
UPDATE "Document" d
SET "signerIds" = ARRAY(
  SELECT u."id" FROM "User" u
  JOIN "Project" p ON p."id" = d."projectId" AND p."companyId" = u."companyId"
  WHERE u."role"::text = ANY (SELECT r::text FROM unnest(d."signerRoles") AS r)
    AND (u."role" = 'OWNER' OR EXISTS (SELECT 1 FROM "ProjectMember" m WHERE m."projectId" = d."projectId" AND m."userId" = u."id"))
    -- someone of that role who already signed keeps the requirement satisfied
  ORDER BY u."name"
)
WHERE cardinality(d."signerRoles") > 0;

-- Where a role was already signed, keep only the person who signed it for that role.
UPDATE "Document" d
SET "signerIds" = ARRAY(
  SELECT DISTINCT x FROM unnest(d."signerIds") AS x
  WHERE NOT EXISTS (
    SELECT 1 FROM "Signature" s JOIN "User" su ON su."id" = s."userId" JOIN "User" xu ON xu."id" = x
    WHERE s."documentId" = d."id" AND s."role" = xu."role" AND s."userId" <> x
  )
);

ALTER TABLE "Document" DROP COLUMN "signerRoles";
ALTER TABLE "Document" ALTER COLUMN "signerIds" DROP DEFAULT;

-- Retention is released at handover and then becomes payable.
ALTER TABLE "Expense" ADD COLUMN "retentionReleasedAt" TIMESTAMP(3),
ADD COLUMN "retentionReleasedById" TEXT;
