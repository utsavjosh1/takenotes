/**
 * Lightweight in-app updater — Windows NSIS only (ADR-0006).
 *
 * No `electron-updater`, no background service, no silent install:
 * check → user clicks Download → verify SHA-256 → launch installer → quit.
 * Works unsigned (one SmartScreen click, same as a manual install).
 * Offline or parked platforms never error loudly — auto-checks stay silent.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { app, shell } from "electron";
import { appError, type AppError } from "../../shared/errors.js";
import { currentDesktopPlatform } from "../../shared/platform/platform.js";
import { isNewerRelease, parseChecksumFile, parseVersion, windowsInstallerName } from "./version.js";

const REPO = process.env["TAKENOTES_UPDATE_REPO"] ?? "utsavjosh1/takenotes";
const API_LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;
const FETCH_TIMEOUT_MS = 15000;
/** Auto-check at most this often; manual checks always run. */
const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type UpdateCheckResult = {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string | null;
  releaseNotes: string | null;
};

export type UpdateProgress = {
  phase: "downloading" | "verifying" | "launching";
  receivedBytes: number;
  totalBytes: number | null;
};

type ReleaseAsset = { name: string; browser_download_url: string };
type ReleaseJson = {
  tag_name: string;
  body: string | null;
  assets: ReleaseAsset[];
};

function userAgent(): string {
  return `takenotes/${app.getVersion()} (windows-update-check)`;
}

async function fetchWithTimeout(url: string, accept: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: accept, "User-Agent": userAgent() },
    });
  } catch (err) {
    throw appError("OFFLINE", "Could not reach the update server. Check your connection and try again.", String(err));
  } finally {
    clearTimeout(timer);
  }
}

function stateFile(): string {
  return path.join(app.getPath("userData"), "update-state.json");
}

function readLastCheckAt(): number {
  try {
    const raw = JSON.parse(readFileSync(stateFile(), "utf8")) as { lastCheckAt?: unknown };
    return typeof raw.lastCheckAt === "number" ? raw.lastCheckAt : 0;
  } catch {
    return 0;
  }
}

function writeLastCheckAt(now: number): void {
  try {
    mkdirSync(path.dirname(stateFile()), { recursive: true });
    writeFileSync(stateFile(), JSON.stringify({ lastCheckAt: now }) + "\n");
  } catch {
    /* cadence is best-effort; a failed write just checks again next launch */
  }
}

function stagingDir(): string {
  return path.join(app.getPath("userData"), "pending-updates");
}

async function fetchRelease(): Promise<ReleaseJson> {
  const res = await fetchWithTimeout(API_LATEST, "application/vnd.github+json");
  if (res.status === 404) {
    // No releases published yet — not an error, just nothing to offer.
    throw appError("NOT_FOUND", "No releases published yet.", "github-404");
  }
  if (!res.ok) {
    throw appError("INTERNAL_ERROR", "Update check failed.", `github-${res.status}`);
  }
  const json = (await res.json()) as Partial<ReleaseJson>;
  if (typeof json.tag_name !== "string" || !Array.isArray(json.assets)) {
    throw appError("INTERNAL_ERROR", "Update check returned an unexpected response.");
  }
  return { tag_name: json.tag_name, body: typeof json.body === "string" ? json.body : null, assets: json.assets };
}

function requireWindows(): { ok: true } | { ok: false; error: AppError } {
  if (currentDesktopPlatform() !== "windows") {
    return {
      ok: false,
      error: appError("INVALID_REQUEST", "Software updates are available on Windows in this version."),
    };
  }
  return { ok: true };
}

/** Check for a newer stable release. `manual=false` is the silent
 *  startup path: cadence-gated, offline-silent, never throws UI noise —
 *  the renderer decides what (if anything) to show. */
export async function checkForUpdates(
  manual: boolean,
): Promise<{ ok: true; result: UpdateCheckResult } | { ok: false; error: AppError }> {
  const gate = requireWindows();
  if (!gate.ok) return gate;
  const currentVersion = app.getVersion();
  if (!manual && Date.now() - readLastCheckAt() < AUTO_CHECK_INTERVAL_MS) {
    return { ok: true, result: { updateAvailable: false, currentVersion, latestVersion: null, releaseNotes: null } };
  }
  let release: ReleaseJson;
  try {
    release = await fetchRelease();
  } catch (err) {
    // Offline on the silent path stays silent (renderer shows nothing).
    if (!manual && (err as AppError)?.code === "OFFLINE") {
      return { ok: true, result: { updateAvailable: false, currentVersion, latestVersion: null, releaseNotes: null } };
    }
    if ((err as AppError)?.code === "NOT_FOUND") {
      return { ok: true, result: { updateAvailable: false, currentVersion, latestVersion: null, releaseNotes: null } };
    }
    return { ok: false, error: toAppError(err) };
  }
  writeLastCheckAt(Date.now());
  if (!parseVersion(release.tag_name) || !isNewerRelease(release.tag_name, currentVersion)) {
    return { ok: true, result: { updateAvailable: false, currentVersion, latestVersion: null, releaseNotes: null } };
  }
  return {
    ok: true,
    result: {
      updateAvailable: true,
      currentVersion,
      latestVersion: release.tag_name,
      releaseNotes: release.body,
    },
  };
}

async function downloadToBuffer(
  url: string,
  onProgress: (received: number, total: number | null) => void,
): Promise<Buffer> {
  const res = await fetchWithTimeout(url, "application/octet-stream");
  if (!res.ok || !res.body) throw appError("INTERNAL_ERROR", "Download failed.", `http-${res.status}`);
  const totalHeader = res.headers.get("content-length");
  const total = totalHeader !== null && /^\d+$/.test(totalHeader) ? Number(totalHeader) : null;
  const chunks: Buffer[] = [];
  let received = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
    received += value.byteLength;
    onProgress(received, total);
  }
  return Buffer.concat(chunks);
}

/** Download the latest installer, verify its SHA-256 against the release's
 *  `SHA256SUMS.txt`, launch it, and quit. The checksum gate is mandatory:
 *  a mismatch aborts before anything executes. */
export async function downloadAndInstall(
  onProgress: (p: UpdateProgress) => void,
): Promise<{ ok: true; result: null } | { ok: false; error: AppError }> {
  const gate = requireWindows();
  if (!gate.ok) return gate;
  let release: ReleaseJson;
  try {
    release = await fetchRelease();
  } catch (err) {
    return { ok: false, error: toAppError(err) };
  }
  const currentVersion = app.getVersion();
  if (!isNewerRelease(release.tag_name, currentVersion)) {
    return { ok: false, error: appError("INVALID_REQUEST", "You already have the latest version.") };
  }
  const exeName = windowsInstallerName(release.tag_name);
  const exeAsset = release.assets.find((a) => a.name === exeName);
  const sumsAsset = release.assets.find((a) => a.name === "SHA256SUMS.txt");
  if (!exeAsset || !sumsAsset) {
    return { ok: false, error: appError("NOT_FOUND", "This release has no Windows installer yet.") };
  }
  try {
    const dir = stagingDir();
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const [exeBytes, sumsBytes] = await Promise.all([
      downloadToBuffer(exeAsset.browser_download_url, (receivedBytes, totalBytes) =>
        onProgress({ phase: "downloading", receivedBytes, totalBytes }),
      ),
      downloadToBuffer(sumsAsset.browser_download_url, () => undefined),
    ]);
    onProgress({ phase: "verifying", receivedBytes: exeBytes.byteLength, totalBytes: exeBytes.byteLength });
    const expected = parseChecksumFile(sumsBytes.toString("utf8"), exeName);
    const actual = createHash("sha256").update(exeBytes).digest("hex");
    if (!expected || expected !== actual) {
      rmSync(dir, { recursive: true, force: true });
      return { ok: false, error: appError("VERIFY_FAILED", "Installer verification failed. The download may be corrupted — try again.") };
    }
    const exePath = path.join(dir, exeName);
    writeFileSync(exePath, exeBytes);
    onProgress({ phase: "launching", receivedBytes: exeBytes.byteLength, totalBytes: exeBytes.byteLength });
    // Per-user NSIS installer needs no elevation; launching it then quitting
    // lets it replace the running app on install.
    const openErr = await shell.openPath(exePath);
    if (openErr) {
      return { ok: false, error: appError("INTERNAL_ERROR", "Could not launch the installer.", openErr) };
    }
    app.quit();
    return { ok: true, result: null };
  } catch (err) {
    rmSync(stagingDir(), { recursive: true, force: true });
    return { ok: false, error: toAppError(err) };
  }
}

function toAppError(err: unknown): AppError {
  if (err && typeof err === "object" && typeof (err as { code?: unknown }).code === "string") return err as AppError;
  return appError("INTERNAL_ERROR", "Software update failed.", String(err));
}
