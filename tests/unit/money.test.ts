import { describe, expect, it } from "vitest";
import { formatMoney, parseMoney } from "@/lib/money";

describe("money", () => {
  it("parses common inputs to cents", () => {
    expect(parseMoney("12,500.50")).toBe(1_250_050);
    expect(parseMoney("$300")).toBe(30_000);
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("1.234")).toBeNull();
  });
  it("formats dollars", () => {
    expect(formatMoney(1_250_000)).toBe("$12,500");
  });
});
