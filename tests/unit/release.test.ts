import { describe, expect, it } from "vitest";
import { actsForOwner, confirmAs, confirmRelease, needsTwo } from "@/lib/release";

const owner = { userId: "o", role: "OWNER" as const };
const pm = { userId: "m", role: "MANAGER" as const };
const pm2 = { userId: "m2", role: "MANAGER" as const };
const acct = { userId: "f", role: "FINANCE" as const };
const sup = { userId: "s", role: "SUPERVISOR" as const };

describe("two-person release", () => {
  it("needs two from the limit up, and always at 0", () => {
    expect(needsTwo(500, 0)).toBe(true);
    expect(needsTwo(499, 500)).toBe(false);
    expect(needsTwo(-600, 500)).toBe(true);
  });

  it("completes with the owner and one other person, in either order", () => {
    expect(confirmRelease({ me: pm, prior: [], two: true, singleOk: false })).toEqual({ ok: true, complete: false });
    expect(confirmRelease({ me: owner, prior: [pm], two: true, singleOk: false })).toEqual({ ok: true, complete: true });
    expect(confirmRelease({ me: acct, prior: [owner], two: true, singleOk: false })).toEqual({ ok: true, complete: true });
  });

  it("won't take two non-owners, two owners, the same person twice or the requester", () => {
    expect(confirmRelease({ me: pm2, prior: [pm], two: true, singleOk: false }).ok).toBe(false);
    expect(confirmRelease({ me: { userId: "o2", role: "OWNER" }, prior: [owner], two: true, singleOk: false }).ok).toBe(false);
    expect(confirmRelease({ me: pm, prior: [pm], two: true, singleOk: false }).ok).toBe(false);
    expect(confirmRelease({ me: owner, requesterId: "o", prior: [], two: true, singleOk: true }).ok).toBe(false);
    expect(confirmRelease({ me: pm, requesterId: "m", prior: [], two: false, singleOk: true }).ok).toBe(false);
  });

  it("only the owner, a manager, the accountant or an admin can confirm", () => {
    expect(confirmRelease({ me: sup, prior: [], two: true, singleOk: false }).ok).toBe(false);
  });

  it("below the limit, one approval under the usual rules is enough", () => {
    expect(confirmRelease({ me: pm, prior: [], two: false, singleOk: true })).toEqual({ ok: true, complete: true });
    expect(confirmRelease({ me: pm, prior: [], two: false, singleOk: false }).ok).toBe(false);
  });
});

describe("signing for the owner", () => {
  const company = { ownerDelegateRoles: ["MANAGER" as const], delegationEndsAt: null, twoPersonFrom: 0 };

  it("applies to delegated roles until the end date", () => {
    expect(actsForOwner("MANAGER", company)).toBe(true);
    expect(actsForOwner("FINANCE", company)).toBe(false);
    expect(actsForOwner("MANAGER", { ...company, delegationEndsAt: new Date("2020-01-01") })).toBe(false);
  });

  it("lets a second manager sign as the owner, but still needs two different people", () => {
    const result = confirmAs({ user: { id: "m2", role: "MANAGER" }, company, amount: 100, prior: [pm], singleOk: () => false });
    expect(result).toEqual({ ok: true, role: "OWNER", complete: true, onBehalf: true });
    expect(confirmAs({ user: { id: "m", role: "MANAGER" }, company, amount: 100, prior: [pm], singleOk: () => false }).ok).toBe(false);
  });

  it("uses the person's own role first", () => {
    expect(confirmAs({ user: { id: "m", role: "MANAGER" }, company, amount: 100, prior: [], singleOk: () => false })).toEqual({ ok: true, role: "MANAGER", complete: false, onBehalf: false });
  });
});
