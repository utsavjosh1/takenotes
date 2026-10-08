import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "@takenotes/contracts/protocol-version";
import { stagedManifestRequired, verifyStagedRuntime } from "@takenotes/desktop/main/wsl/runtime-installer";

/** 7e acceptance: staged-runtime provenance is fail-closed. Fixture dirs
 * stand in for `resources/wsl/linux-x64` (sha256 over exact bytes). */
describe("verifyStagedRuntime", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function stage(overrides: Record<string, string> = {}, manifestOverrides: Record<string, unknown> = {}): string {
    const dir = mkdtempSync(path.join(tmpdir(), "dn-7e-"));
    dirs.push(dir);
    const files: Record<string, string> = {
      node: "node-bytes",
      "helper.cjs": "helper-bytes",
      "runtime.cjs": "runtime-bytes",
      ...overrides,
    };
    const sha = (name: string) => createHash("sha256").update(files[name] ?? "").digest("hex");
    const manifest = {
      runtime: "node",
      runtimeVersion: "24.19.0",
      helperVersion: "0.0.9",
      protocolVersion: PROTOCOL_VERSION,
      architecture: "x86_64",
      nodeSha256: sha("node"),
      helperSha256: sha("helper.cjs"),
      runtimeSha256: sha("runtime.cjs"),
      ...manifestOverrides,
    };
    for (const [name, content] of Object.entries(files)) {
      if (content !== "") writeFileSync(path.join(dir, name), content);
    }
    writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
    return dir;
  }

  it("accepts an intact staged dir", async () => {
    expect(await verifyStagedRuntime(stage(), { requireManifest: true })).toEqual({ ok: true, verified: true });
  });

  it("names the tampered file, never a generic failure", async () => {
    const dir = stage();
    writeFileSync(path.join(dir, "helper.cjs"), "tampered");
    const res = await verifyStagedRuntime(dir, { requireManifest: true });
    expect(res).toMatchObject({ error: { code: "INTERNAL_ERROR" } });
    if ("error" in res) expect(res.error.message).toContain("helper.cjs");
  });

  it("names a missing staged file", async () => {
    const dir = stage({ node: "" });
    // "" content means: write nothing (see stage helper) → file missing.
    const res = await verifyStagedRuntime(dir, { requireManifest: true });
    if ("error" in res) expect(res.error.message).toContain("node");
    else throw new Error("expected a missing-file error");
  });

  it("rejects protocol mismatch with both versions named", async () => {
    const res = await verifyStagedRuntime(stage({}, { protocolVersion: PROTOCOL_VERSION + 1 }), { requireManifest: true });
    if ("error" in res) {
      expect(res.error.message).toContain(String(PROTOCOL_VERSION + 1));
      expect(res.error.message).toContain(String(PROTOCOL_VERSION));
    } else throw new Error("expected a protocol-mismatch error");
  });

  it("rejects corrupt or incomplete manifests", async () => {
    const badJson = stage();
    writeFileSync(path.join(badJson, "manifest.json"), "{nope");
    expect(await verifyStagedRuntime(badJson, { requireManifest: true })).toMatchObject({
      error: { code: "INTERNAL_ERROR" },
    });
    const incomplete = stage({}, { helperSha256: undefined });
    // JSON drops undefined values → field missing on parse.
    expect(await verifyStagedRuntime(incomplete, { requireManifest: true })).toMatchObject({
      error: { code: "INTERNAL_ERROR" },
    });
  });

  it("skips without a manifest in dev, fails closed when required", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "dn-7e-"));
    dirs.push(dir);
    expect(await verifyStagedRuntime(dir, { requireManifest: false })).toEqual({ ok: true, verified: false });
    expect(await verifyStagedRuntime(dir, { requireManifest: true })).toMatchObject({
      error: { code: "INTERNAL_ERROR" },
    });
  });

  it("does not require a manifest in this (dev/test) environment", () => {
    expect(stagedManifestRequired()).toBe(false);
  });
});
