import { spawn } from "node:child_process";
import {
  decodeWslListOutput,
  isVerboseListShape,
  parseWslVerboseList,
} from "./output-decoder.js";
import { helperEnv, resolveWslExe } from "./launch-security.js";

export type WslDistribution = {
  name: string;
  state?: string;
  version?: string;
  isDefault?: boolean;
};

export type WslRunResult = { code: number | null; output: Buffer };

/** Default runner: spawn the pinned system `wsl.exe` with `shell: false` and
 * separate argv. Listing (`-l`) is read-only — it never starts a distro. */
function runWslExe(args: string[], timeoutMs: number): Promise<WslRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(resolveWslExe(), args, { shell: false, timeout: timeoutMs, env: helperEnv() });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.on("error", (err) => reject(err));
    child.on("close", (code) => resolve({ code, output: Buffer.concat(chunks) }));
  });
}

/** List installed WSL distributions (Windows-only at runtime).
 *
 * Verbose-first: `wsl.exe -l -v` yields name/state/version/default records.
 * When the verbose command fails (non-zero exit, spawn error) or its output
 * is not a recognizable list, fall back to the existing `--list --quiet`
 * path (names only). Both paths are list-only — neither starts a
 * distribution (ADR-0007); pressing Connect/Open on a stopped distro is the
 * explicit start intent (handled by later tickets).
 *
 * The `run` injection point exists so tests can drive orchestration without
 * a real `wsl.exe`; production always uses the pinned spawn above. */
export async function listDistributions(
  timeoutMs = 15000,
  run: (args: string[], timeoutMs: number) => Promise<WslRunResult> = runWslExe,
): Promise<WslDistribution[]> {
  let verboseRaw: Buffer | null = null;
  try {
    const result = await run(["-l", "-v"], timeoutMs);
    if (result.code === 0) verboseRaw = result.output;
  } catch {
    verboseRaw = null;
  }
  if (verboseRaw !== null) {
    const parsed = parseWslVerboseList(verboseRaw);
    // Records win outright; a header-shaped but row-less output is a genuine
    // \"no distros installed\" answer. Anything else falls through to quiet.
    if (parsed.length > 0 || isVerboseListShape(verboseRaw)) return parsed;
  }
  const quiet = await run(["--list", "--quiet"], timeoutMs);
  if (quiet.code !== 0) {
    throw new Error(`wsl.exe --list --quiet exited with code ${quiet.code}`);
  }
  return decodeWslListOutput(quiet.output).map((name) => ({ name }));
}
