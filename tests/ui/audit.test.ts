import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** The migration's finish line, kept as a test so it cannot slip back. */
describe("migration audit stays at zero", () => {
  const out = JSON.parse(execFileSync(process.execPath, [join(__dirname, "..", "..", "tools", "scripts", "audit-ui.mjs"), "--json"], { encoding: "utf8" })) as Record<string, number | string>;
  for (const [name, value] of Object.entries(out)) {
    if (typeof value !== "number") continue;
    it(name, () => expect(value).toBe(0));
  }
});
