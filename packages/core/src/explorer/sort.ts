/**
 * Step 2 Explorer pure helpers (testable, no IPC).
 * Sort: folders-first always; key name/modified/created (created falls back
 * to mtimeMs until the adapter exposes birthtime), dir asc/desc, stable.
 */
export type ExplorerSortKey = "name" | "modified" | "created";
export type ExplorerSortDir = "asc" | "desc";
export type ExplorerSort = { key: ExplorerSortKey; dir: ExplorerSortDir };

export type SortableEntry = {
  name: string;
  relativePath: string;
  kind: "file" | "directory";
  mtimeMs: number;
};

export const DEFAULT_EXPLORER_SORT: ExplorerSort = { key: "name", dir: "asc" };

export function parseExplorerSort(raw: unknown): ExplorerSort {
  if (typeof raw !== "object" || raw === null) return DEFAULT_EXPLORER_SORT;
  const r = raw as Record<string, unknown>;
  const key = r["key"] === "modified" || r["key"] === "created" ? r["key"] : "name";
  const dir = r["dir"] === "desc" ? "desc" : "asc";
  return { key, dir };
}

function compareFor(sort: ExplorerSort) {
  return (a: SortableEntry, b: SortableEntry): number => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    const primary = sort.key === "name"
      ? a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true })
      : a.mtimeMs - b.mtimeMs; // created → mtimeMs fallback (no birthtime on wire yet)
    const c = primary === 0 ? a.relativePath.localeCompare(b.relativePath) : primary;
    return sort.dir === "desc" ? -c : c;
  };
}

export function sortEntries<T extends SortableEntry>(entries: readonly T[], sort: ExplorerSort): T[] {
  return [...entries].sort(compareFor(sort));
}

/** Ancestor dirs of `rel` from shallowest to deepest parent (excl. self). */
export function ancestorsOf(rel: string): string[] {
  const parts = rel.replaceAll("\\", "/").split("/").filter(Boolean);
  parts.pop();
  const out: string[] = [];
  for (let i = 1; i <= parts.length; i++) out.push(parts.slice(0, i).join("/"));
  return out;
}

/** Resolve a Quick Open query to a creation target.
 * Empty/Escape names rejected; `..`/absolute/NUL/illegal components rejected;
 * missing extension defaults to `.md`; joined under `dir` ("" = root).
 * Mirrors the rename-row Windows-illegal set + Step 0 confinement.
 */
export function resolveCreateTarget(
  query: string,
  dir: string,
): { ok: true; rel: string } | { ok: false; error: string } {
  const name = query.trim();
  if (!name) return { ok: false, error: "Enter a file name." };
  const segments = name.replaceAll("\\", "/").split("/").filter(Boolean);
  if (segments.length === 0) return { ok: false, error: "Enter a file name." };
  for (const seg of segments) {
    if (seg === "." || seg === ".." || seg !== seg.trim())
      return { ok: false, error: `"${seg}" is not a valid name.` };
    // eslint-disable-next-line no-control-regex
    if (/[<>:"|?*\u0000-\u001f]/.test(seg))
      return { ok: false, error: "That name contains characters Windows does not allow." };
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i.test(seg))
      return { ok: false, error: `"${seg}" is reserved on Windows.` };
  }
  let rel = segments.join("/");
  if (!/\.[A-Za-z0-9]{1,8}$/.test(rel)) rel += ".md";
  const cleanDir = dir.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  return { ok: true, rel: cleanDir ? `${cleanDir}/${rel}` : rel };
}

/** Collision-safe copy name: `name.md` → `name 1.md` (case-insensitive set). */
export function uniqueCopyName(filename: string, existingLower: Set<string>): string {
  if (!existingLower.has(filename.toLowerCase())) return filename;
  const dot = filename.lastIndexOf(".");
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : "";
  for (let i = 1; i < 1000; i++) {
    const candidate = `${stem} ${i}${ext}`;
    if (!existingLower.has(candidate.toLowerCase())) return candidate;
  }
  return `${stem} ${Date.now()}${ext}`;
}
