import { describe, expect, it } from "vitest";
import { nameChangeAllowed } from "@/lib/names";

const now = new Date("2026-11-22T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 864e5);

describe("name changes", () => {
  it("allows two in 20 days", () => {
    expect(nameChangeAllowed([], now)).toEqual({ ok: true, left: 2 });
    expect(nameChangeAllowed([daysAgo(3)], now)).toEqual({ ok: true, left: 1 });
  });
  it("blocks a third and says when the next one is allowed", () => {
    expect(nameChangeAllowed([daysAgo(15), daysAgo(3)], now)).toEqual({ ok: false, nextAt: new Date(daysAgo(15).getTime() + 20 * 864e5) });
  });
  it("forgets changes older than 20 days", () => {
    expect(nameChangeAllowed([daysAgo(25), daysAgo(21), daysAgo(1)], now)).toEqual({ ok: true, left: 1 });
  });
});
