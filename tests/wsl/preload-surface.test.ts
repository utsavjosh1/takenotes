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

  it("exposes no arbitrary Linux command surface (P1-04: structured ops only)", () => {
    // Mutations travel as validated structured payloads (file.rename,
    // file.delete, directory.create/rename/delete) — the renderer can
    // never issue raw commands, spawn shells, or pick a different user.
    expect(source).not.toMatch(/wsl\.exec|\.shell\(|\.spawn\(|shell\.exec|command\.run/i);
    expect(source).not.toMatch(/exec\s*:\s*\(|spawn\s*:\s*\(/);
  });
});
