import "server-only";
import { createHash } from "node:crypto";

/** Tamper-evident fingerprint of what was signed, by whom and when. */
export function fingerprint(parts: (string | number)[]) {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

export const shortPrint = (f: string) => f.slice(0, 12).toUpperCase().replace(/(.{4})/g, "$1 ").trim();
