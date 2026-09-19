import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { appError, type AppError } from "../../shared/errors.js";
import type { FileRevision } from "../../shared/contracts/ipc.js";
import { toCanonicalRel } from "../../shared/platform/filesystem.js";
import { validatePosixRelativePath, validateWorkspaceId } from "./path-security.js";

export const RECOVERY_VERSION = 1;
export const RECOVERY_THROTTLE_MS = 5 * 60 * 1000;
export const RECOVERY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type RecoveryReason = "edit" | "save" | "close" | "shutdown" | "restore-before";

export type RecoverySnapshotMeta = {
  snapshotId: string;
  workspaceId: string;
  relativePath: string;
  createdAt: number;
  contentHash: string;
  byteLength: number;
  reason: RecoveryReason;
};

export type RecoverySnapshot = RecoverySnapshotMeta & {
  content: string;
};

type RecoveryRecord = RecoverySnapshot & {
  version: typeof RECOVERY_VERSION;
};

export type RecoveryResult<T> = { ok: true; result: T } | { ok: false; error: AppError };

export type RecoveryRestoreWriter = (
  content: string,
  expectedHash: string,
  newlineStyle: "lf" | "crlf",
  hadBom: boolean,
) => Promise<{ revision: FileRevision } | { error: AppError }>;

type Deps = {
  now?: () => number;
  id?: () => string;
};

function contentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function relKey(relativePath: string): string {
  return createHash("sha256").update(relativePath, "utf8").digest("hex");
}

function validateSnapshotId(input: unknown): { snapshotId: string } | { error: AppError } {
  if (typeof input !== "string" || input.length < 1 || input.length > 96 || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(input)) {
    return { error: appError("INVALID_REQUEST", "Invalid recovery snapshot id.") };
  }
  return { snapshotId: input };
}

function validateRecoveryPath(workspaceIdInput: unknown, relativePathInput: unknown): { workspaceId: string; relativePath: string } | { error: AppError } {
  const wid = validateWorkspaceId(workspaceIdInput);
  if ("error" in wid) return { error: wid.error };
  if (typeof relativePathInput !== "string") return { error: appError("INVALID_PATH", "Path must be a string.") };
  const rel = validatePosixRelativePath(toCanonicalRel(relativePathInput));
  if ("error" in rel) return { error: rel.error };
  return { workspaceId: wid.workspaceId, relativePath: rel.relativePath };
}

function isRecoveryReason(v: unknown): v is RecoveryReason {
  return v === "edit" || v === "save" || v === "close" || v === "shutdown" || v === "restore-before";
}

function isRecord(v: unknown): v is RecoveryRecord {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    r["version"] === RECOVERY_VERSION &&
    typeof r["snapshotId"] === "string" &&
    typeof r["workspaceId"] === "string" &&
    typeof r["relativePath"] === "string" &&
    typeof r["createdAt"] === "number" &&
    typeof r["contentHash"] === "string" &&
    typeof r["byteLength"] === "number" &&
    typeof r["content"] === "string" &&
    isRecoveryReason(r["reason"])
  );
}

function metaOf(record: RecoveryRecord): RecoverySnapshotMeta {
  return {
    snapshotId: record.snapshotId,
    workspaceId: record.workspaceId,
    relativePath: record.relativePath,
    createdAt: record.createdAt,
    contentHash: record.contentHash,
    byteLength: record.byteLength,
    reason: record.reason,
  };
}

async function atomicJsonWrite(file: string, record: RecoveryRecord, now: number): Promise<void> {
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `${path.basename(file)}.tmp-${process.pid}-${now}`);
  await fs.writeFile(tmp, Buffer.from(JSON.stringify(record), "utf8"), { flag: "wx" });
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
}

export class RecoveryStore {
  private readonly now: () => number;
  private readonly id: () => string;

  constructor(private readonly baseDir: string, deps: Deps = {}) {
    this.now = deps.now ?? Date.now;
    this.id = deps.id ?? randomUUID;
  }

  private recoveryRoot(): string {
    return path.join(this.baseDir, "recovery");
  }

  private fileRoot(workspaceId: string, relativePath: string): string {
    return path.join(this.recoveryRoot(), workspaceId, relKey(relativePath));
  }

  private snapshotsDir(workspaceId: string, relativePath: string): string {
    return path.join(this.fileRoot(workspaceId, relativePath), "snapshots");
  }

  async captureChanged(input: {
    workspaceId: string;
    relativePath: string;
    content: string;
    reason: RecoveryReason;
  }): Promise<RecoveryResult<RecoverySnapshotMeta | null>> {
    const v = validateRecoveryPath(input.workspaceId, input.relativePath);
    if ("error" in v) return { ok: false, error: v.error };
    if (typeof input.content !== "string" || !isRecoveryReason(input.reason)) return { ok: false, error: appError("INVALID_REQUEST", "Invalid recovery content.") };
    const now = this.now();
    try {
      await this.cleanup(v.workspaceId, now);
      const existing = await this.recordsFor(v.workspaceId, v.relativePath, now, false);
      const latest = existing[0];
      const hash = contentHash(input.content);
      if (latest && latest.contentHash === hash) return { ok: true, result: null };
      if (input.reason === "edit" && latest && now - latest.createdAt < RECOVERY_THROTTLE_MS) {
        return { ok: true, result: null };
      }
      const snapshotId = this.id();
      const record: RecoveryRecord = {
        version: RECOVERY_VERSION,
        snapshotId,
        workspaceId: v.workspaceId,
        relativePath: v.relativePath,
        createdAt: now,
        contentHash: hash,
        byteLength: Buffer.byteLength(input.content, "utf8"),
        reason: input.reason,
        content: input.content,
      };
      await atomicJsonWrite(path.join(this.snapshotsDir(v.workspaceId, v.relativePath), `${now}-${snapshotId}.json`), record, now);
      return { ok: true, result: metaOf(record) };
    } catch (err) {
      return { ok: false, error: appError("INTERNAL_ERROR", "Could not persist recovery snapshot.", String(err)) };
    }
  }

  async list(workspaceId: string, relativePath: string): Promise<RecoveryResult<RecoverySnapshotMeta[]>> {
    const v = validateRecoveryPath(workspaceId, relativePath);
    if ("error" in v) return { ok: false, error: v.error };
    try {
      await this.cleanup(v.workspaceId, this.now());
      const records = await this.recordsFor(v.workspaceId, v.relativePath, this.now(), false);
      return { ok: true, result: records.map(metaOf) };
    } catch (err) {
      return { ok: false, error: appError("INTERNAL_ERROR", "Could not read recovery history.", String(err)) };
    }
  }

  async read(snapshotIdInput: string): Promise<RecoveryResult<RecoverySnapshot>> {
    const sid = validateSnapshotId(snapshotIdInput);
    if ("error" in sid) return { ok: false, error: sid.error };
    try {
      const record = await this.findBySnapshotId(sid.snapshotId);
      if (!record) return { ok: false, error: appError("NOT_FOUND", "Recovery snapshot not found.") };
      return { ok: true, result: { ...metaOf(record), content: record.content } };
    } catch (err) {
      return { ok: false, error: appError("INTERNAL_ERROR", "Could not read recovery snapshot.", String(err)) };
    }
  }

  async restore(
    input: {
      workspaceId: string;
      relativePath: string;
      snapshotId: string;
      currentContent: string;
      expectedHash: string;
      newlineStyle: "lf" | "crlf";
      hadBom: boolean;
    },
    writer: RecoveryRestoreWriter,
  ): Promise<RecoveryResult<{ revision: FileRevision; content: string; preRestoreSnapshot: RecoverySnapshotMeta | null }>> {
    const v = validateRecoveryPath(input.workspaceId, input.relativePath);
    if ("error" in v) return { ok: false, error: v.error };
    const sid = validateSnapshotId(input.snapshotId);
    if ("error" in sid) return { ok: false, error: sid.error };
    if (typeof input.currentContent !== "string" || typeof input.expectedHash !== "string") {
      return { ok: false, error: appError("INVALID_REQUEST", "Invalid recovery restore request.") };
    }
    const snap = await this.read(sid.snapshotId);
    if (!snap.ok) return snap;
    if (snap.result.workspaceId !== v.workspaceId || snap.result.relativePath !== v.relativePath) {
      return { ok: false, error: appError("INVALID_REQUEST", "Recovery snapshot does not belong to this note.") };
    }
    const pre = await this.captureChanged({
      workspaceId: v.workspaceId,
      relativePath: v.relativePath,
      content: input.currentContent,
      reason: "restore-before",
    });
    if (!pre.ok) return pre;
    const written = await writer(snap.result.content, input.expectedHash, input.newlineStyle, input.hadBom);
    if ("error" in written) return { ok: false, error: written.error };
    return { ok: true, result: { revision: written.revision, content: snap.result.content, preRestoreSnapshot: pre.result } };
  }

  private async recordsFor(workspaceId: string, relativePath: string, now: number, includeExpired: boolean): Promise<RecoveryRecord[]> {
    const dir = this.snapshotsDir(workspaceId, relativePath);
    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch {
      return [];
    }
    const records: RecoveryRecord[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(dir, name), "utf8");
        const parsed: unknown = JSON.parse(raw);
        if (!isRecord(parsed)) continue;
        if (parsed.workspaceId !== workspaceId || parsed.relativePath !== relativePath) continue;
        if (!includeExpired && now - parsed.createdAt > RECOVERY_RETENTION_MS) continue;
        records.push(parsed);
      } catch {
        /* malformed/incomplete records are ignored */
      }
    }
    records.sort((a, b) => b.createdAt - a.createdAt || b.snapshotId.localeCompare(a.snapshotId));
    return records;
  }

  private async findBySnapshotId(snapshotId: string): Promise<RecoveryRecord | null> {
    const root = this.recoveryRoot();
    const stack = [root];
    while (stack.length > 0) {
      const dir = stack.pop()!;
      let dirents;
      try {
        dirents = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const d of dirents) {
        const p = path.join(dir, d.name);
        if (d.isDirectory()) {
          stack.push(p);
          continue;
        }
        if (!d.name.endsWith(".json")) continue;
        try {
          const parsed: unknown = JSON.parse(await fs.readFile(p, "utf8"));
          if (isRecord(parsed) && parsed.snapshotId === snapshotId && this.now() - parsed.createdAt <= RECOVERY_RETENTION_MS) {
            return parsed;
          }
        } catch {
          /* ignore malformed/incomplete records */
        }
      }
    }
    return null;
  }

  private async cleanup(workspaceId: string, now: number): Promise<void> {
    const workspaceDir = path.join(this.recoveryRoot(), workspaceId);
    let dirs;
    try {
      dirs = await fs.readdir(workspaceDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const snapshots = path.join(workspaceDir, d.name, "snapshots");
      let names: string[];
      try {
        names = await fs.readdir(snapshots);
      } catch {
        continue;
      }
      for (const name of names) {
        if (!name.endsWith(".json")) continue;
        const file = path.join(snapshots, name);
        try {
          const parsed: unknown = JSON.parse(await fs.readFile(file, "utf8"));
          if (isRecord(parsed) && now - parsed.createdAt > RECOVERY_RETENTION_MS) {
            await fs.rm(file, { force: true });
          }
        } catch {
          /* cleanup is bounded/best effort: ignore malformed files */
        }
      }
    }
  }
}
