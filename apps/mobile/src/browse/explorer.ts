/**
 * M1 — Explorer listing (thin module over core sort).
 *
 * Interface: `listExplorerEntries` + `joinRel`. All ordering semantics
 * (`folders-first`, name/modified/created, per-workspace persist) live in
 * `core/explorer/sort` — this module only adapts `DirectoryListing` rows
 * to `SortableEntry` and builds canonical `/`-separated rels.
 *
 * RN-safe: no `node:path` (Metro has none). Rel math is explicit concat.
 */

import { sortEntries, type ExplorerSort, type SortableEntry } from "@takenotes/core/explorer/sort";
import type { DirectoryListing } from "../adapters/listing.js";

export type ExplorerEntry = SortableEntry & { mtimeMs: number };

export function joinRel(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

function joinAbs(root: string, rel: string): string {
  const base = root.replace(/\/+$/, "");
  return rel ? `${base}/${rel}` : base;
}

/** List one directory's immediate children, sorted. `dir=""` = root. */
export async function listExplorerEntries(
  lister: DirectoryListing,
  root: string,
  dir: string,
  sort: ExplorerSort,
): Promise<ExplorerEntry[]> {
  const rows = await lister.listDirectory(joinAbs(root, dir));
  const entries: ExplorerEntry[] = rows.map((r) => ({
    name: r.name,
    relativePath: joinRel(dir, r.name),
    kind: r.isDirectory ? "directory" : "file",
    mtimeMs: r.mtimeMs,
  }));
  return sortEntries(entries, sort);
}
