import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import { appError, type AppError } from "@takenotes/contracts/errors";
import { PROTOCOL_VERSION } from "@takenotes/contracts/protocol-version";
import { helperEnv, resolveWslExe } from "./launch-security.js";

/** Fixed bootstrap: transfer helper/runtime bytes through an owned wsl.exe
 * process stdin. The shell fragment is fixed application code; only the
 * destination directory and file names (app-controlled) travel as argv. */
export function buildBootstrapArgv(kind: "node" | "helper", version: string): string[] {
  // Fixed script: reads one length-prefixed payload? No — simplest honest
  // design: base64 chunks via stdin are overkill; we stream raw bytes and the
  // fixed shell side writes stdin to the destination file.
  // Destination roots are fixed under the user's HOME (resolved inside WSL).
  if (kind === "node") {
    return ["-d", "__DISTRO__", "--exec", "sh", "-c", "mkdir -p \"$HOME/.local/share/takenotes/runtime\" && cat > \"$HOME/.local/share/takenotes/runtime/node\""];
  }
  return ["-d", "__DISTRO__", "--exec", "sh", "-c", `mkdir -p "$HOME/.local/share/takenotes/helpers/${version}" && cat > "$HOME/.local/share/takenotes/helpers/${version}/helper.cjs"`];
}

export function withDistro(argv: string[], distro: string): string[] {
  return argv.map((a) => (a === "__DISTRO__" ? distro : a));
}

/** Staged-runtime manifest as written by `stage-wsl-runtime.mjs`: real
 * checksums over the exact bytes that ship. */
export type StagedManifest = {
  runtime: string;
  runtimeVersion: string;
  helperVersion: string;
  protocolVersion: number;
  architecture: string;
  nodeSha256: string;
  helperSha256: string;
  runtimeSha256: string;
};

/** Packaged installs must carry a verified staged runtime; dev runs from
 * `dist-helper` directly and skips (diagnostic at the call site, never
 * silent). Defensive: any doubt means dev-mode — verification must never
 * brick a developer loop, only a shipped install. */
export function stagedManifestRequired(): boolean {
  try {
    return (app as { isPackaged?: unknown } | undefined)?.isPackaged === true;
  } catch {
    return false;
  }
}

function isManifest(v: unknown): v is StagedManifest {
  if (!v || typeof v !== "object") return false;
  const m = v as Record<string, unknown>;
  for (const k of ["runtime", "runtimeVersion", "helperVersion", "architecture", "nodeSha256", "helperSha256", "runtimeSha256"]) {
    if (typeof m[k] !== "string" || (m[k] as string).length === 0) return false;
  }
  return typeof m["protocolVersion"] === "number";
}

async function sha256File(abs: string): Promise<string | null> {
  try {
    return createHash("sha256").update(await readFile(abs)).digest("hex");
  } catch {
    return null;
  }
}

/** Verify the staged runtime dir before any spawn (7e, fail-closed).
 *
 * - Manifest absent + not required (dev): `{ok, verified: false}` — the
 *   caller logs the skip; existing dev behavior is unchanged.
 * - Manifest absent + required (packaged): error — a shipped install
 *   without provenance never spawns.
 * - Manifest present: fields valid, `protocolVersion` matches the app, and
 *   `node` + `helper.cjs` + `runtime.cjs` hashes match. Any mismatch names
 *   the file — never a generic failure.
 *
 * Pure filesystem logic (no spawn, no Electron behavior beyond the
 * `requireManifest` flag) — fully covered by fixture tests. */
export async function verifyStagedRuntime(
  dir: string,
  opts?: { requireManifest?: boolean },
): Promise<{ ok: true; verified: boolean } | { error: AppError }> {
  const requireManifest = opts?.requireManifest ?? stagedManifestRequired();
  let raw: string;
  try {
    raw = await readFile(path.join(dir, "manifest.json"), "utf8");
  } catch {
    return requireManifest
      ? { error: appError("INTERNAL_ERROR", "Staged WSL runtime manifest is missing — reinstall takenotes.") }
      : { ok: true as const, verified: false };
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(raw);
  } catch {
    return { error: appError("INTERNAL_ERROR", "Staged WSL runtime manifest is corrupt — reinstall takenotes.") };
  }
  if (!isManifest(manifest)) {
    return { error: appError("INTERNAL_ERROR", "Staged WSL runtime manifest is incomplete — reinstall takenotes.") };
  }
  if (manifest.protocolVersion !== PROTOCOL_VERSION) {
    return {
      error: appError(
        "INTERNAL_ERROR",
        `Staged helper protocol ${manifest.protocolVersion} does not match app protocol ${PROTOCOL_VERSION} — reinstall takenotes.`,
      ),
    };
  }
  for (const [file, expected] of [
    ["node", manifest.nodeSha256],
    ["helper.cjs", manifest.helperSha256],
    ["runtime.cjs", manifest.runtimeSha256],
  ] as const) {
    const actual = await sha256File(path.join(dir, file));
    if (actual === null) {
      return { error: appError("INTERNAL_ERROR", `Staged WSL runtime file is missing: ${file} — reinstall takenotes.`) };
    }
    if (actual.toLowerCase() !== expected.toLowerCase()) {
      return { error: appError("INTERNAL_ERROR", `Staged WSL runtime file failed verification: ${file} — reinstall takenotes.`) };
    }
  }
  return { ok: true as const, verified: true };
}

export async function verifyLocalFileSha256(filePath: string, expectedHex: string): Promise<boolean> {
  const bytes = await readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex") === expectedHex;
}

export function spawnWsl(argv: string[], stdinBytes?: Buffer): Promise<{ stdout: Buffer; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(resolveWslExe(), argv, { shell: false, env: helperEnv() });
    const out: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => out.push(c));
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout: Buffer.concat(out), code: code ?? -1 }));
    if (stdinBytes) {
      child.stdin.write(stdinBytes, () => child.stdin.end());
    } else {
      child.stdin.end();
    }
  });
}
