import "server-only";
import type { Role } from "@prisma/client";
import { db } from "./db";
import type { CurrentUser } from "./auth";
import { confirmAs, type Confirmer } from "./release";

export type ReleaseKind = "INVOICE" | "RETENTION" | "CHANGE_ORDER" | "PURCHASE_ORDER";

export function confirmationsFor(kind: ReleaseKind, targetIds: string[]) {
  return db.confirmation.findMany({ where: { kind, targetId: { in: targetIds } }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" } });
}

/** Checks and records one person's confirmation on a release of money. Returns whether the release is now complete. */
export async function addConfirmation(opts: {
  user: CurrentUser;
  projectId: string;
  kind: ReleaseKind;
  targetId: string;
  amount: number;
  /** Force one or two people instead of comparing the amount with the company's limit. */
  two?: boolean;
  requesterId?: string | null;
  statement: string;
  /** Whether this user may approve alone when one person is enough, given the role being tried. */
  singleOk: (role: Role) => boolean;
}): Promise<{ ok: true; complete: boolean; asOwner: boolean } | { ok: false; error: string }> {
  const prior: Confirmer[] = await db.confirmation.findMany({ where: { kind: opts.kind, targetId: opts.targetId }, orderBy: { createdAt: "asc" }, select: { userId: true, role: true } });
  const result = confirmAs({ user: opts.user, company: opts.user.company, amount: opts.amount, two: opts.two, requesterId: opts.requesterId, prior, singleOk: opts.singleOk });
  if (!result.ok) return result;
  await db.confirmation.create({
    data: { projectId: opts.projectId, kind: opts.kind, targetId: opts.targetId, userId: opts.user.id, role: result.role, onBehalfOfOwner: result.onBehalf, statement: opts.statement },
  });
  return { ok: true, complete: result.complete, asOwner: result.onBehalf };
}

/** Clears confirmations when a request is rejected, so a resubmission starts fresh. */
export function clearConfirmations(kind: ReleaseKind, targetId: string) {
  return db.confirmation.deleteMany({ where: { kind, targetId } });
}
