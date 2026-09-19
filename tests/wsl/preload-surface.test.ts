import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** The renderer must receive structured distro data, never shell capability:
 * no child_process, no spawn/exec, no generic channel invoke in preload. */
describe("preload surface (no arbitrary process spawning)", () => {
  const source = readFileSync(path.resolve("src/preload/index.ts"), "utf8");

  it("exposes only narrow named distro functions", () => {
    expect(source).toContain("listWslDistributions");
    expect(source).toContain("listWslUsers");
    // No process-spawning capability reaches the renderer: no child_process,
    // no spawn/exec, no shell execution. (`shell:` below is only the
    // reveal-in-file-manager key, not execution.)
    expect(source).not.toMatch(/child_process|execFile|\.spawn\(|openExternal|exec\(/);
  });

  it("has no generic invoke channel", () => {
    expect(source).not.toMatch(/invoke\s*\(\s*channel|invoke\s*\(\s*name/);
  });
});
