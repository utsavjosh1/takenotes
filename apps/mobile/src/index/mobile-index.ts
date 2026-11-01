/**
 * M1 — Mobile index wiring (mirrors desktop `workspace-index.ts`).
 *
 * Same store (`WorkspaceIndex`), same bounds (2000-file cap → `truncated`,
 * >1 MiB → `skipped`, never silent), same canvas exclusion (`.canvas`
 * files never enter the index). Fed through the mobile seams
 * (`DirectoryListing` + `MobileWorkspace.read`) instead of Electron IPC.
 *
 * Deliberate duplication note: `syncFileIndex` + `indexStatusMessage`
 * mirror their desktop namesakes line-for-line. Their right long-term home
 * is `@takenotes/core`, but hoisting them is out of M1 scope — the M1 gate
 * pins both mirrors with identical vectors so a drift fails loudly.
 */

import type { AppError } from "@takenotes/contracts/errors";
import { isCanvasPath } from "@takenotes/core/canvas/model";
import { MAX_INDEX_FILE_BYTES, WorkspaceIndex, type IndexInput } from "@takenotes/core/index/store";
import type { FileRevision } from "@takenotes/contracts/ipc";
import type { DirectoryListing } from "../adapters/listing.js";
import type { MobileWorkspace } from "../workspace/mobile-workspace.js";

/** Same bound as desktop: bulk builds cap here with a visible notice. */
export const MAX_LISTED_FILES = 2000;

/** Non-note directories never enter the index (mirrors desktop list). */
const EXCLUDED_DIRS = new Set([".git", "node_modules", "dist", "build", "coverage", ".next", ".cache"]);

export type MobileIndexApi = {
  lister: DirectoryListing;
  reader: Pick<MobileWorkspace, "read">;
};

export type IndexBuildSummary = { indexed: number; skipped: number; truncated: boolean };

export type IndexBuildResult =
  | { ok: true; indexed: number; skipped: number; truncated: boolean }
  | { ok: false; error: AppError };

/** Post-write sync: notes parse in, `.canvas` files drop instead. */
export function syncMobileFileIndex(
  store: WorkspaceIndex,
  workspaceId: string,
  relativePath: string,
  content: string,
  revision: FileRevision,
): void {
  if (isCanvasPath(relativePath)) store.remove(workspaceId, relativePath);
  else store.upsert(workspaceId, relativePath, content, revision);
}

/** Visibility rule for partial builds (pure — unit-tested). */
export function mobileIndexStatusMessage(summary: IndexBuildSummary): string | null {
  if (summary.truncated && summary.skipped > 0) {
    return `Partial index · ${summary.indexed} files (over ${MAX_LISTED_FILES} files, ${summary.skipped} skipped) — Search may be incomplete`;
  }
  if (summary.truncated) {
    return `Partial index · ${summary.indexed} files (over ${MAX_LISTED_FILES} files) — Search may be incomplete`;
  }
  if (summary.skipped > 0) {
    return `Search may be incomplete · ${summary.skipped} file${summary.skipped === 1 ? "" : "s"} skipped (too large or unreadable)`;
  }
  return null;
}

function joinAbs(root: string, rel: string): string {
  const base = root.replace(/\/+$/, "");
  return rel ? `${base}/${rel}` : base;
}

/** Full (re)build from sandbox bytes. One unreadable file → skipped (counted);
 *  a root-list failure → `{ ok: false }` (never a partial index as complete). */
export async function buildMobileIndex(
  api: MobileIndexApi,
  store: WorkspaceIndex,
  workspaceId: string,
  root: string,
): Promise<IndexBuildResult> {
  let rels: string[];
  try {
    rels = await walkFiles(api.lister, root);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { code: "NOT_FOUND", message } as AppError };
  }
  const truncated = rels.length > MAX_LISTED_FILES;
  const listed = truncated ? rels.slice(0, MAX_LISTED_FILES) : rels;
  const inputs: IndexInput[] = [];
  let skipped = 0;
  for (const rel of listed) {
    if (isCanvasPath(rel)) continue;
    const out = await api.reader.read(rel);
    if ("error" in out) {
      skipped += 1;
      continue;
    }
    if (Buffer.byteLength(out.result.content, "utf8") > MAX_INDEX_FILE_BYTES) {
      skipped += 1;
      continue;
    }
    inputs.push({ workspaceId, relativePath: rel, content: out.result.content, revision: out.result.revision });
  }
  store.rebuild(workspaceId, inputs);
  return { ok: true, indexed: inputs.length, skipped, truncated };
}

/** Eager depth-first walk (sorted for determinism), honoring exclusions.
 *  Root-list failure propagates (workspace-level → honest abort); deeper
 *  failures skip that subtree (one unreadable dir never kills the build). */
async function walkFiles(lister: DirectoryListing, root: string): Promise<string[]> {
  const out: string[] = [];
  const stack: string[] = [""];
  let first = true;
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let rows;
    try {
      rows = await lister.listDirectory(joinAbs(root, dir));
    } catch (err) {
      if (first) throw err;
      continue;
    }
    first = false;
    const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name));
    for (const r of sorted) {
      const rel = dir ? `${dir}/${r.name}` : r.name;
      if (r.isDirectory) {
        if (EXCLUDED_DIRS.has(r.name)) continue;
        stack.push(rel);
      } else if (rel.endsWith(".md") || rel.endsWith(".markdown")) {
        out.push(rel);
        if (out.length > MAX_LISTED_FILES) return out;
      }
    }
  }
  return out.sort();
}
