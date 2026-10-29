/**
 * M2 — Mobile recovery (mirrors desktop `RecoveryStore` semantics).
 *
 * Same contract, sandbox storage: throttle (≤1 `edit` snapshot per file per
 * 5 min), `save`/`close`/`shutdown` snapshot whenever content differs, skip
 * identical, 7-day retention + janitor, "recovery is not backup".
 *
 * Differences from desktop (all documented, all tested):
 *  - Storage is an injected flat KV (`RecoveryStorage`) — AsyncStorage on
 *    device (`recovery-binding.ts`), memory here. No directories: keys are
 *    `takenotes.recovery.<ns>.<relFp>.<snapshotId>`.
 *  - Namespace is `mobile-local.<encoded-root>` (stable across restarts,
 *    distinct per root) instead of a sha256 `workspaceKeyFor` — V1 has one
 *    sandbox workspace and no `node:crypto` on RN. Align when hoisting.
 *  - Dedup fingerprint is FNV-1a (`fingerprintContent`) — device-local
 *    equality only, not a security hash. Revision/CONFLICT hashes stay
 *    core sha256; never confuse the two.
 *
 * Constants mirror desktop `recovery.ts` exactly — the M2 gate pins
 * equality by importing both.
 */

import { validatePosixRelativePath } from "@takenotes/core/policy/note-policy";

// Values mirror desktop `recovery.ts` (`RECOVERY_THROTTLE_MS = 5min`,
// `RECOVERY_RETENTION_MS = 7d`). The M2 gate imports both sides and
// asserts equality — the pin lives in the test so no desktop `node:fs`
// code ever enters the mobile bundle.

export const RECOVERY_THROTTLE_MS = 5 * 60 * 1000;
export const RECOVERY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type RecoveryReason = "edit" | "save" | "close" | "shutdown";

export type RecoverySnapshotMeta = {
  snapshotId: string;
  namespace: string;
  relativePath: string;
  createdAt: number;
  fingerprint: string;
  byteLength: number;
  reason: RecoveryReason;
};

export type RecoverySnapshot = RecoverySnapshotMeta & { content: string };

/** Flat key-value surface (AsyncStorage-shaped). */
export interface RecoveryStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** Keys starting with prefix (order unspecified). */
  listKeys(prefix: string): Promise<string[]>;
}

/** Test/dev storage. Evicts nothing on its own — janitor does that. */
export class MemoryRecoveryStorage implements RecoveryStorage {
  private readonly map = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.map.delete(key);
  }

  async listKeys(prefix: string): Promise<string[]> {
    return [...this.map.keys()].filter((k) => k.startsWith(prefix));
  }
}

/** FNV-1a 32-bit hex. Pure TS, RN-safe. Dedup equality only. */
export function fingerprintContent(content: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    h ^= content.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Stable namespace for one sandbox root. Same root reopened → same
 *  namespace; different roots → different namespaces. */
export function mobileRecoveryNamespace(root: string): string {
  const canon = root.replace(/\/+$/, "");
  const encoded = canon.replace(/[^A-Za-z0-9._~-]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
  return `mobile-local.${encoded}`;
}

function relFingerprint(rel: string): string {
  return fingerprintContent(rel);
}

function keyFor(namespace: string, rel: string, snapshotId: string): string {
  return `takenotes.recovery.${namespace}.${relFingerprint(rel)}.${snapshotId}`;
}

function prefixFor(namespace: string): string {
  return `takenotes.recovery.${namespace}.`;
}

export class MobileRecovery {
  private readonly now: () => number;
  private readonly id: () => string;
  private counter = 0;

  constructor(
    private readonly storage: RecoveryStorage,
    deps: { now?: () => number; id?: () => string } = {},
  ) {
    this.now = deps.now ?? Date.now;
    this.id = deps.id ?? (() => `s${this.now().toString(36)}${(this.counter++).toString(36)}`);
  }

  private async recordsFor(namespace: string, rel: string): Promise<RecoverySnapshot[]> {
    const out: RecoverySnapshot[] = [];
    for (const key of await this.storage.listKeys(prefixFor(namespace))) {
      const raw = await this.storage.get(key);
      if (!raw) continue;
      try {
        const r = JSON.parse(raw) as RecoverySnapshot;
        if (r.namespace === namespace && r.relativePath === rel) out.push(r);
      } catch {
        /* corrupt record: janitor removes it */
        await this.storage.remove(key);
      }
    }
    return out.sort((a, b) => b.createdAt - a.createdAt || (a.snapshotId < b.snapshotId ? -1 : 1));
  }

  /** Mirror of desktop `captureChanged`: identical → null; `edit` inside
   *  the throttle window → null; else store. Always janitors first. */
  async snapshot(
    namespace: string,
    relativePath: string,
    content: string,
    reason: RecoveryReason,
  ): Promise<RecoverySnapshotMeta | null> {
    const v = validatePosixRelativePath(relativePath);
    if ("error" in v) throw new Error(`invalid recovery path: ${v.error.message}`);
    const rel = v.relativePath;
    const now = this.now();
    await this.janitor(namespace, now);
    const existing = await this.recordsFor(namespace, rel);
    const latest = existing[0];
    const fp = fingerprintContent(content);
    if (latest && latest.fingerprint === fp) return null;
    if (reason === "edit" && latest && now - latest.createdAt < RECOVERY_THROTTLE_MS) return null;
    const meta: RecoverySnapshotMeta = {
      snapshotId: this.id(),
      namespace,
      relativePath: rel,
      createdAt: now,
      fingerprint: fp,
      byteLength: content.length,
      reason,
    };
    await this.storage.set(keyFor(namespace, rel, meta.snapshotId), JSON.stringify({ ...meta, content }));
    return meta;
  }

  /** Newest-first snapshots for one file ("snapshots current first"). */
  async list(namespace: string, relativePath: string): Promise<RecoverySnapshotMeta[]> {
    return (await this.recordsFor(namespace, relativePath)).map(({ content: _c, ...meta }) => meta);
  }

  async read(namespace: string, relativePath: string, snapshotId: string): Promise<string | null> {
    const raw = await this.storage.get(keyFor(namespace, relativePath, snapshotId));
    if (!raw) return null;
    try {
      const r = JSON.parse(raw) as RecoverySnapshot;
      return r.namespace === namespace && r.relativePath === relativePath ? r.content : null;
    } catch {
      return null;
    }
  }

  /** Purge snapshots older than 7 days. Returns removed count. */
  async janitor(namespace: string, now = this.now()): Promise<number> {
    let removed = 0;
    for (const key of await this.storage.listKeys(prefixFor(namespace))) {
      const raw = await this.storage.get(key);
      if (!raw) continue;
      try {
        const r = JSON.parse(raw) as RecoverySnapshot;
        if (now - r.createdAt > RECOVERY_RETENTION_MS) {
          await this.storage.remove(key);
          removed += 1;
        }
      } catch {
        await this.storage.remove(key);
        removed += 1;
      }
    }
    return removed;
  }
}
