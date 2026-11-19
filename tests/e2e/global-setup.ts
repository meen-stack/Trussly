import { execSync } from "node:child_process";

/** Every run starts from a fresh demo company. */
export default function globalSetup() {
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
}
