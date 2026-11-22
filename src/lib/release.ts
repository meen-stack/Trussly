import type { Role } from "@prisma/client";

/**
 * Two-person rule for releasing money: invoices, retention, change orders and purchase orders.
 * Pure, so it can be unit tested. The actions record each confirmation and only release once complete.
 */

export type Confirmer = { userId: string; role: Role };
type Result = { ok: true; complete: boolean } | { ok: false; error: string };

/** Roles that can be the second person next to the owner. */
export const CONFIRMER_ROLES: Role[] = ["MANAGER", "FINANCE", "ADMIN"];
/** Roles the owner can let sign in their place. */
export const DELEGABLE_ROLES: Role[] = ["MANAGER", "FINANCE", "ADMIN", "SUPERVISOR"];

/** Whether this amount needs two people. A limit of 0 means every amount does. */
export const needsTwo = (amount: number, twoFrom: number) => Math.abs(amount) >= twoFrom;

/** Whether this user may act for the owner right now: their role is delegated and the delegation hasn't ended. */
export function actsForOwner(role: Role, company: { ownerDelegateRoles: Role[]; delegationEndsAt: Date | null }, now = new Date()) {
  if (role === "OWNER") return false;
  if (!company.ownerDelegateRoles.includes(role)) return false;
  return !company.delegationEndsAt || company.delegationEndsAt > now;
}

/**
 * Can `me` add a confirmation, and does it complete the release?
 * - The person who asked for the money can't confirm it, and nobody confirms twice.
 * - With two needed: one confirmation from the owner (or someone acting for them) and one from a manager, accountant or admin.
 * - With one needed: `singleOk` says whether this person may approve alone under the usual limits.
 */
export function confirmRelease(opts: { me: Confirmer; requesterId?: string | null; prior: Confirmer[]; two: boolean; singleOk: boolean }): Result {
  const { me, requesterId, prior, two } = opts;
  if (requesterId && me.userId === requesterId) return { ok: false, error: "You asked for this, so other people must confirm it." };
  if (prior.some((c) => c.userId === me.userId)) return { ok: false, error: "You've already confirmed. A second person must confirm." };
  if (!two) return opts.singleOk ? { ok: true, complete: true } : { ok: false, error: "This needs the owner's approval." };

  const isOwner = me.role === "OWNER";
  if (!isOwner && !CONFIRMER_ROLES.includes(me.role)) return { ok: false, error: "Only the owner, a manager or the accountant can confirm payments." };
  const first = prior[0];
  if (!first) return { ok: true, complete: false };
  if ((first.role === "OWNER") === isOwner) {
    return { ok: false, error: isOwner ? "The owner has confirmed. A manager or the accountant must confirm too." : "The owner must give the second confirmation." };
  }
  return { ok: true, complete: true };
}

/** What a pending release is waiting for, for labels. */
export function waitingFor(prior: Confirmer[], two: boolean) {
  if (!two || prior.length === 0) return null;
  return prior[0].role === "OWNER" ? "a manager or the accountant" : "the owner";
}

/** Roles to tell when something waits for the owner: the owner, plus any roles acting for them. */
export function ownerSideRoles(company: { ownerDelegateRoles: Role[]; delegationEndsAt: Date | null }, now = new Date()): Role[] {
  const active = !company.delegationEndsAt || company.delegationEndsAt > now;
  return ["OWNER", ...(active ? company.ownerDelegateRoles : [])];
}

type Company = { ownerDelegateRoles: Role[]; delegationEndsAt: Date | null; twoPersonFrom: number };

/**
 * The role this user would confirm as, or an error: their own role first, then the owner's
 * when the owner has delegated to their role. Used by the actions and to decide which buttons to show.
 */
export function confirmAs(opts: {
  user: { id: string; role: Role };
  company: Company;
  amount: number;
  two?: boolean;
  requesterId?: string | null;
  prior: Confirmer[];
  singleOk: (role: Role) => boolean;
  now?: Date;
}): { ok: true; role: Role; complete: boolean; onBehalf: boolean } | { ok: false; error: string } {
  const two = opts.two ?? needsTwo(opts.amount, opts.company.twoPersonFrom);
  const attempt = (role: Role) => confirmRelease({ me: { userId: opts.user.id, role }, requesterId: opts.requesterId, prior: opts.prior, two, singleOk: opts.singleOk(role) });
  const own = attempt(opts.user.role);
  if (own.ok) return { ok: true, role: opts.user.role, complete: own.complete, onBehalf: false };
  if (actsForOwner(opts.user.role, opts.company, opts.now)) {
    const owner = attempt("OWNER");
    if (owner.ok) return { ok: true, role: "OWNER", complete: owner.complete, onBehalf: true };
  }
  return own;
}
