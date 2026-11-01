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

export function searchCommands<T extends CommandSearchItem>(commands: readonly T[], query: string, recentCommandIds: readonly string[] = [], limit = 12): T[] {
  const q = commandQueryText(query);
  const recentRank = (id: string): number => {
    const i = recentCommandIds.indexOf(id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const ordered = [...commands].sort((a, b) => recentRank(a.id) - recentRank(b.id));
  if (!q) return ordered.slice(0, limit);
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
    .map((x) => x.command)
    .slice(0, limit);
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

/* ---------- Quick Open + palette extras ---------- */

/** Where each needle letter lands in `hay` (a run when it appears as a substring), or null when it doesn't match. */
export function fuzzyPositions(hay: string, needle: string): number[] | null {
  const h = hay.toLowerCase();
  const n = needle.toLowerCase().trim();
  if (!n) return [];
  const at = h.indexOf(n);
  if (at >= 0) return Array.from({ length: n.length }, (_, i) => at + i);
  const out: number[] = [];
  let from = 0;
  for (const ch of n) {
    const i = h.indexOf(ch, from);
    if (i < 0) return null;
    out.push(i);
    from = i + 1;
  }
  return out;
}

export type PaletteKind = "files" | "commands" | "tags" | "schedule" | "search";

/** The first character picks the palette mode: > commands, # tags, @ schedule, ? search. */
export function paletteKindOf(query: string): { kind: PaletteKind; text: string } {
  const q = query.trimStart();
  switch (q[0]) {
    case ">": return { kind: "commands", text: q.slice(1).trim() };
    case "#": return { kind: "tags", text: q.slice(1).trim() };
    case "@": return { kind: "schedule", text: q.slice(1).trim() };
    case "?": return { kind: "search", text: q.slice(1).trim() };
    default: return { kind: "files", text: query.trim() };
  }
}

export const COMMAND_GROUPS = ["File", "Edit", "View", "Go to", "Agents", "App"] as const;
export type CommandGroup = (typeof COMMAND_GROUPS)[number];

/** Plain group for a command, from its registry category and id. */
export function commandGroup(def: { id: string; category: string }): CommandGroup {
  const id = def.id;
  if (/^(today|calendar|tags|tasks|properties|collections|graph|search|quickOpen|palette)\./.test(id) || id === "note.openToday" || id === "note.open") return "Go to";
  if (/^(settings|app\.(checkForUpdates|closeWindow|quit)|shortcuts)/.test(id)) return "App";
  if (/^agents?\./.test(id)) return "Agents";
  if (/^(editor|tree\.(rename|trash)|favorites)/.test(id)) return "Edit";
  if (/^view\.|^app\.(zoom|toggleFullscreen)/.test(id)) return "View";
  return "File";
}

/** Why a command can't run right now, in plain words. */
export function commandDisabledReason(id: string): string {
  if (/^(editor\.|note\.close|template\.|favorites\.addActive)/.test(id)) return "Open a note first";
  if (id === "note.reopenClosed") return "No closed tabs to reopen";
  if (id.startsWith("view.tab")) return "No tab in that place";
  if (id === "workspace.openWsl") return "Only on Windows";
  if (id === "app.checkForUpdates") return "Not available here";
  if (id === "workspace.switch") return "Use the workspace menu in the title bar";
  return "Open a workspace first";
}

/** Tags with note counts, matching the typed text (all when empty). */
export function searchTagList(tags: ReadonlyArray<{ tag: string; count: number }>, query: string): Array<{ tag: string; count: number }> {
  const q = query.replace(/^#/, "").trim();
  if (!q) return [...tags].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)).slice(0, 30);
  return tags
    .map((t) => ({ t, s: fuzzyScore(t.tag, q) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s || b.t.count - a.t.count || a.t.tag.localeCompare(b.t.tag))
    .map((x) => x.t)
    .slice(0, 30);
}

/* ---------- "@" quick task ---------- */

export type QuickTask = { text: string; date?: string; time?: string; label: string };

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS3 = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number): string => String(n).padStart(2, "0");
const iso = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number): Date => { const c = new Date(d.getFullYear(), d.getMonth(), d.getDate()); c.setDate(c.getDate() + n); return c; };

/** Reads "call Ron tomorrow 3pm" into text, date and time. Words understood: today, tonight, tomorrow, weekdays, "in 3 days/weeks", YYYY-MM-DD, "Oct 30", and times like 3pm or 15:00. Nothing is guessed: no date means no schedule. */
export function parseQuickTask(input: string, now: Date): QuickTask | null {
  let s = ` ${input.trim()} `;
  if (!input.trim()) return null;
  let date: Date | null = null;
  let time: string | undefined;
  const take = (re: RegExp, fn: (m: RegExpExecArray) => void): void => {
    const m = re.exec(s);
    if (!m) return;
    fn(m);
    s = s.slice(0, m.index) + " " + s.slice(m.index + m[0].length);
  };
  take(/\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?=\s|$)/i, (m) => {
    let h = Number(m[1]); const min = Number(m[2] ?? 0);
    if (h < 1 || h > 12 || min > 59) return;
    if (/pm/i.test(m[3]!) && h < 12) h += 12;
    if (/am/i.test(m[3]!) && h === 12) h = 0;
    time = `${pad(h)}:${pad(min)}`;
  });
  if (!time) take(/\s(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)(?=\s|$)/, (m) => { time = `${pad(Number(m[1]))}:${m[2]}`; });
  take(/\s(\d{4})-(\d{2})-(\d{2})(?=\s|$)/, (m) => { date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])); });
  if (!date) take(/\s(?:on\s+)?(?:(?:next|this)\s+)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*(?=\s|$)/i, (m) => {
    const want = WEEKDAYS.indexOf(m[1]!.slice(0, 3).toLowerCase());
    let diff = (want - now.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    date = addDays(now, diff);
  });
  if (!date) take(/\s(?:on\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?=\s|$)/i, (m) => {
    const d = new Date(now.getFullYear(), MONTHS3.indexOf(m[1]!.toLowerCase()), Number(m[2]));
    if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d.setFullYear(d.getFullYear() + 1);
    date = d;
  });
  if (!date) take(/\sin\s+(\d{1,3})\s+(day|days|week|weeks)(?=\s|$)/i, (m) => { date = addDays(now, Number(m[1]) * (/week/i.test(m[2]!) ? 7 : 1)); });
  if (!date) take(/\s(tomorrow|tmrw|today|tonight)(?=\s|$)/i, (m) => { date = addDays(now, /^t(omorrow|mrw)$/i.test(m[1]!) ? 1 : 0); });
  if (!date && time) date = addDays(now, 0);
  const text = s.replace(/\s+(at|on|by)\s*$/i, " ").replace(/\s+/g, " ").trim() || input.trim();
  if (!date) return { text, label: "No date" };
  const d = date as Date;
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000);
  const day = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]} ${MONTHS3[d.getMonth()]![0]!.toUpperCase()}${MONTHS3[d.getMonth()]!.slice(1)} ${d.getDate()}`;
  return { text, date: iso(d), ...(time ? { time } : {}), label: time ? `${day} ${time}` : day };
}

/** `@scheduled(2026-10-29 15:00)` token text, or "" without a date. */
export function scheduledToken(t: QuickTask): string {
  return t.date ? ` @scheduled(${t.date}${t.time ? ` ${t.time}` : ""})` : "";
}
