import { existsSync } from "node:fs";
import path from "node:path";

/** Resolve the Windows system wsl.exe instead of trusting PATH.
 * Outside Windows (dev/tests) this returns the bare name unchanged. */
export function resolveWslExe(): string {
  if (process.platform !== "win32") return "wsl.exe";
  const systemRoot = process.env["SystemRoot"] ?? process.env["SYSTEMROOT"] ?? "C:\\Windows";
  const pinned = path.win32.join(systemRoot, "System32", "wsl.exe");
  try {
    if (existsSync(pinned)) return pinned;
  } catch {
    /* fall through to PATH lookup */
  }
  return "wsl.exe";
}

/** Strip variables that must never steer the helper runtime.
 * The helper needs no network and no inherited Node behavior. */
const STRIPPED_ENV = new Set([
  "NODE_OPTIONS",
  "NODE_PATH",
  "NODE_EXTRA_CA_CERTS",
  "NODE_TLS_REJECT_UNAUTHORIZED",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
]);

/** Minimal explicit environment for helper children.
 * Keeps OS-required entries (SystemRoot for wsl.exe) and locale identity,
 * drops everything that could alter Node's module loading, TLS, or proxying. */
export function helperEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined || STRIPPED_ENV.has(k)) continue;
    // Allowlist OS/platform essentials + locale identity; nothing else crosses.
    if (
      k === "SystemRoot" ||
      k === "SYSTEMROOT" ||
      k === "SystemDrive" ||
      k === "SYSTEMDRIVE" ||
      k === "COMSPEC" ||
      k === "PATHEXT" ||
      k === "HOME" ||
      k === "USER" ||
      k === "LOGNAME" ||
      k === "LANG" ||
      k === "LC_ALL" ||
      k === "TMPDIR" ||
      k === "PATH" ||
      k === "Path"
    ) {
      env[k] = v;
    }
  }
  if (extra) for (const [k, v] of Object.entries(extra)) env[k] = v;
  return env;
}
