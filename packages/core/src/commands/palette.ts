import type { CommandDefinition } from "./registry.js";
import type { DocumentIndexEntry } from "../index/document.js";

export type PaletteMode = "commands" | "quickOpen";

export type CommandSearchItem = CommandDefinition & {
  shortcut?: string;
  enabled?: boolean;
};

export type QuickOpenItem = {
  workspaceId: string;
  relativePath: string;
  title?: string;
};

export type QuickOpenResult = QuickOpenItem & {
  score: number;
  recent: boolean;
};

export function fuzzyScore(hay: string, needle: string): number {
  const h = hay.toLowerCase();
  const n = needle.toLowerCase().trim();
  if (!n) return 0;
  if (h === n) return 1000;
  if (h.startsWith(n)) return 500 + n.length;
  if (h.includes(n)) return 300 + n.length;
  let hi = 0;
  let score = 0;
  for (const ch of n) {
    const i = h.indexOf(ch, hi);
    if (i < 0) return -1;
    score += i === hi ? 2 : 1;
    hi = i + 1;
  }
  return score;
}

export function paletteModeForQuery(query: string): PaletteMode {
  return query.trimStart().startsWith(">") ? "commands" : "quickOpen";
}

export function commandQueryText(query: string): string {
  const trimmedLeft = query.trimStart();
  return trimmedLeft.startsWith(">") ? trimmedLeft.slice(1).trim() : query.trim();
}

function basename(rel: string): string {
  return rel.slice(rel.lastIndexOf("/") + 1);
}

function displayPath(rel: string): string {
  return rel.replaceAll("\\", "/");
}

function filenameNoExt(rel: string): string {
  const base = basename(rel);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

export function searchCommands<T extends CommandSearchItem>(commands: readonly T[], query: string, recentCommandIds: readonly string[] = []): T[] {
  const q = commandQueryText(query);
  const recentRank = (id: string): number => {
    const i = recentCommandIds.indexOf(id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const ordered = [...commands].sort((a, b) => recentRank(a.id) - recentRank(b.id));
  if (!q) return ordered.slice(0, 12);
  return ordered
    .map((command, order) => {
      const score = Math.max(
        fuzzyScore(command.title, q),
        fuzzyScore(command.category, q) - 25,
        fuzzyScore(command.id, q) - 75,
      );
      return { command, score, order };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((x) => x.command);
}

export function indexedEntryToQuickOpenItem(entry: DocumentIndexEntry): QuickOpenItem {
  return { workspaceId: entry.workspaceId, relativePath: entry.relativePath, title: entry.title };
}

function scored(value: string, query: string, bonus: number): number {
  const score = fuzzyScore(value, query);
  return score < 0 ? -1 : score + bonus;
}

function quickScore(item: QuickOpenItem, query: string): number {
  const file = basename(item.relativePath);
  const stem = filenameNoExt(item.relativePath);
  const path = displayPath(item.relativePath);
  const title = item.title?.trim() ?? "";
  const q = query.trim();
  if (!q) return 0;
  const exact = Math.max(
    file.toLowerCase() === q.toLowerCase() ? 2000 : -1,
    stem.toLowerCase() === q.toLowerCase() ? 1900 : -1,
    title && title.toLowerCase() === q.toLowerCase() ? 1800 : -1,
  );
  if (exact >= 0) return exact;
  return Math.max(
    scored(file, q, 300),
    scored(stem, q, 250),
    title ? scored(title, q, 200) : -1,
    scored(path, q, -50),
  );
}

export function searchQuickOpen(
  files: readonly QuickOpenItem[],
  query: string,
  recentPaths: readonly string[] = [],
  maxResults = 30,
): QuickOpenResult[] {
  const q = query.trim();
  if (!q) {
    return recentPaths
      .map((relativePath) => files.find((f) => f.relativePath === relativePath))
      .filter((f): f is QuickOpenItem => Boolean(f))
      .slice(0, 8)
      .map((f, i) => ({ ...f, score: 100 - i, recent: true }));
  }
  const recent = new Set(recentPaths);
  return files
    .map((file, order) => ({ file, score: quickScore(file, q), order }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => {
      const depthA = a.file.relativePath.split("/").length;
      const depthB = b.file.relativePath.split("/").length;
      return b.score - a.score || depthA - depthB || a.file.relativePath.localeCompare(b.file.relativePath) || a.order - b.order;
    })
    .slice(0, maxResults)
    .map((x) => ({ ...x.file, score: x.score, recent: recent.has(x.file.relativePath) }));
}
