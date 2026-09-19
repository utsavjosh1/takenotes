import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { WorkspaceKind } from "../../shared/platform/types.js";

/**
 * Crash-recovery draft store (Stage 7 follow-up).
 *
 * Drafts live OUTSIDE note workspaces under Electron `app.getPath("userData")`
 * (caller-supplied `baseDir`, so this module stays testable without Electron).
 * A draft is recovery data only — the renderer must NEVER display `Saved`
 * merely because a draft file exists. `Saved` means bytes reached the note
 * file via the conflict-safe write path; `draft written` means bytes reached
 * this store.
 *
 * Record: workspace identity + workspace type + relative path + base revision
 * + timestamp + content. Writes are bounded and atomic (tmp + fsync + rename,
 * same discipline as note writes). Callers debounce (750 ms suggested) and
 * must never persist every keystroke synchronously — see `createDraftSaver`.
 */

export const DRAFT_VERSION = 1;
/** Drafts older than this are reported stale; callers decide UX (banner kept, never auto-applied). */
export const DRAFT_STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
/** Upper bounds: keeps a runaway session from filling userData. */
export const MAX_DRAFT_BYTES = 1024 * 1024;
export const MAX_DRAFT_COUNT = 50;

export type DraftRecord = {
  version: typeof DRAFT_VERSION;
  /** Stable workspace identity: native root path, or `distro + linuxPath` for WSL. */
  workspaceKey: string;
  workspaceType: WorkspaceKind;
  workspaceDisplayName: string;
  relativePath: string;
  /** SHA-256 of the file bytes the draft was edited from (conflict gate). */
  baseRevisionHash: string;
  updatedAt: number;
  content: string;
};

export type DraftInput = {
  workspaceType: WorkspaceKind;
  /** Native absolute root, or WSL linux root (`/home/u/notes`). */
  workspaceRoot: string;
  /** WSL distro; required when workspaceType is `windows-wsl`. */
  distro?: string;
  /** WSL Linux user; part of the identity (P1-03). Native workspaces omit it. */
  linuxUser?: string;
  workspaceDisplayName: string;
  relativePath: string;
  baseRevisionHash: string;
  content: string;
};

/** Stable, filesystem-safe identity for a workspace (survives restarts; registry ids do not). */
export function workspaceKeyFor(input: Pick<DraftInput, "workspaceType" | "workspaceRoot" | "distro" | "linuxUser">): string {
  const distro = input.workspaceType === "windows-wsl" ? (input.distro ?? "") : "";
  const linuxUser = input.workspaceType === "windows-wsl" ? (input.linuxUser ?? "") : "";
  return createHash("sha256")
    .update(`${input.workspaceType}\0${input.workspaceRoot}\0${distro}\0${linuxUser}`, "utf8")
    .digest("hex")
    .slice(0, 32);
}

/** Filesystem-safe draft filename for a workspace + relative path pair. */
export function draftFileNameFor(workspaceKey: string, relativePath: string): string {
  const relHash = createHash("sha256").update(relativePath, "utf8").digest("hex").slice(0, 32);
  return `${workspaceKey}.${relHash}.json`;
}

function draftsDir(baseDir: string): string {
  return path.join(baseDir, "drafts");
}

function isRecordShape(v: unknown): v is DraftRecord {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    r["version"] === DRAFT_VERSION &&
    typeof r["workspaceKey"] === "string" &&
    typeof r["workspaceType"] === "string" &&
    typeof r["workspaceDisplayName"] === "string" &&
    typeof r["relativePath"] === "string" &&
    typeof r["baseRevisionHash"] === "string" &&
    typeof r["updatedAt"] === "number" &&
    typeof r["content"] === "string"
  );
}

function validateInput(input: DraftInput): string | null {
  if (!input.relativePath || input.relativePath.length > 1024) return "Invalid relative path.";
  if (input.content.length > MAX_DRAFT_BYTES) return "Draft exceeds size bound.";
  if (!/^[a-f0-9]{64}$/.test(input.baseRevisionHash)) return "Invalid base revision.";
  if (input.workspaceType === "windows-wsl" && !input.distro) return "WSL drafts require a distro.";
  return null;
}

/** Persist (or overwrite) a draft atomically. Returns a machine-readable outcome; never throws for I/O. */
export async function saveDraft(
  baseDir: string,
  input: DraftInput,
  now: number = Date.now(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  const invalid = validateInput(input);
  if (invalid) return { ok: false, error: invalid };
  const workspaceKey = workspaceKeyFor(input);
  const record: DraftRecord = {
    version: DRAFT_VERSION,
    workspaceKey,
    workspaceType: input.workspaceType,
    workspaceDisplayName: input.workspaceDisplayName,
    relativePath: input.relativePath,
    baseRevisionHash: input.baseRevisionHash,
    updatedAt: now,
    content: input.content,
  };
  const dir = draftsDir(baseDir);
  try {
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, draftFileNameFor(workspaceKey, input.relativePath));
    const bytes = Buffer.from(JSON.stringify(record), "utf8");
    const tmp = `${file}.tmp-${process.pid}-${now}`;
    await fs.writeFile(tmp, bytes, { flag: "wx" });
    try {
      const fh = await fs.open(tmp, "r+");
      try {
        await fh.sync();
      } finally {
        await fh.close();
      }
      await fs.rename(tmp, file);
    } catch (err) {
      await fs.rm(tmp, { force: true });
      throw err;
    }
    await enforceBounds(dir);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** Evict oldest drafts beyond MAX_DRAFT_COUNT (best effort; never fails the save). */
async function enforceBounds(dir: string): Promise<void> {
  try {
    const names = await fs.readdir(dir);
    const json = names.filter((n) => n.endsWith(".json"));
    if (json.length <= MAX_DRAFT_COUNT) return;
    const withTime = await Promise.all(
      json.map(async (n) => ({ n, t: (await fs.stat(path.join(dir, n)).catch(() => null))?.mtimeMs ?? 0 })),
    );
    withTime.sort((a, b) => a.t - b.t);
    for (const victim of withTime.slice(0, withTime.length - MAX_DRAFT_COUNT)) {
      await fs.rm(path.join(dir, victim.n), { force: true });
    }
  } catch {
    /* bounds are advisory */
  }
}

/** Load the draft for one note. `null` = none. Malformed files are ignored (callers may sweep them). */
export async function loadDraft(
  baseDir: string,
  key: Pick<DraftInput, "workspaceType" | "workspaceRoot" | "distro" | "linuxUser"> & { relativePath: string },
): Promise<DraftRecord | null> {
  const workspaceKey = workspaceKeyFor(key);
  const file = path.join(draftsDir(baseDir), draftFileNameFor(workspaceKey, key.relativePath));
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecordShape(parsed)) return null;
    if (parsed.workspaceKey !== workspaceKey || parsed.relativePath !== key.relativePath) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Remove the draft for one note (e.g. after a successful save). Never throws. */
export async function clearDraft(
  baseDir: string,
  key: Pick<DraftInput, "workspaceType" | "workspaceRoot" | "distro" | "linuxUser"> & { relativePath: string },
): Promise<void> {
  const workspaceKey = workspaceKeyFor(key);
  await fs.rm(path.join(draftsDir(baseDir), draftFileNameFor(workspaceKey, key.relativePath)), { force: true });
}

/**
 * List all readable drafts. Malformed files are SKIPPED (never thrown) so one
 * corrupt draft can never prevent launch; `malformed` reports swept names for
 * optional cleanup/telemetry-free logging.
 */
export async function listDrafts(baseDir: string): Promise<{ drafts: DraftRecord[]; malformed: string[] }> {
  const dir = draftsDir(baseDir);
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return { drafts: [], malformed: [] };
  }
  const drafts: DraftRecord[] = [];
  const malformed: string[] = [];
  for (const n of names) {
    if (!n.endsWith(".json")) continue;
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(path.join(dir, n), "utf8"));
      if (isRecordShape(parsed)) drafts.push(parsed);
      else malformed.push(n);
    } catch {
      malformed.push(n);
    }
  }
  drafts.sort((a, b) => b.updatedAt - a.updatedAt);
  return { drafts, malformed };
}

/** Predictable stale policy: drafts older than DRAFT_STALE_AFTER_MS are stale (kept, bannered, never auto-applied). */
export function isDraftStale(draft: DraftRecord, now: number = Date.now()): boolean {
  return now - draft.updatedAt > DRAFT_STALE_AFTER_MS;
}

/**
 * Recovery decision — the core safety rule. A draft must NEVER overwrite disk:
 * - disk missing/unreadable → retain draft (`recoverable`: external delete keeps the draft).
 * - disk hash === draft.baseRevisionHash → disk unchanged since edit began → offer recovery.
 * - disk hash differs → someone else touched the file → keep BOTH, force an
 *   explicit user choice (reload-from-disk vs keep-my-version); never auto-merge.
 */
export async function recoveryDecision(
  readDiskBytes: () => Promise<Buffer | null>,
  draft: DraftRecord,
  now: number = Date.now(),
): Promise<
  | { kind: "recoverable"; stale: boolean }
  | { kind: "disk-changed"; stale: boolean }
  | { kind: "disk-missing" }
> {
  let bytes: Buffer | null;
  try {
    bytes = await readDiskBytes();
  } catch {
    bytes = null;
  }
  if (bytes === null) return { kind: "disk-missing" };
  const hash = createHash("sha256").update(bytes).digest("hex");
  const stale = isDraftStale(draft, now);
  if (hash === draft.baseRevisionHash) return { kind: "recoverable", stale };
  return { kind: "disk-changed", stale };
}

/**
 * Debounced draft writer for the renderer/main bridge. Collapses keystroke
 * bursts into one write per `delayMs` (default 750). `flush()` persists
 * immediately (e.g. window close); `cancel()` drops a pending write.
 */
export function createDraftSaver(
  write: (content: string) => void,
  delayMs = 750,
): { schedule(content: string): void; flush(): void; cancel(): void; pending(): boolean } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest = "";
  let hasPending = false;
  return {
    schedule(content: string): void {
      latest = content;
      hasPending = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        hasPending = false;
        write(latest);
      }, delayMs);
      // A pending timer must not keep the app alive on quit.
      if (typeof timer === "object" && timer !== null && "unref" in timer) {
        (timer as unknown as { unref(): void }).unref();
      }
    },
    flush(): void {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (hasPending) {
        hasPending = false;
        write(latest);
      }
    },
    cancel(): void {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      hasPending = false;
    },
    pending(): boolean {
      return hasPending;
    },
  };
}
