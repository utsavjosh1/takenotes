/** Calendar query + drag rewrite (filesystem-first, no database).
 *
 * V1 has exactly two native sources (ADR-0011): event notes (`type: event`
 * frontmatter with a required `start`, optional `end`) and tasks carrying
 * `@scheduled`. `due` is a deadline and never a time block: dragging a task
 * rewrites only its `@scheduled` token, leaving `@due` and everything else
 * on the line byte-identical. Ranges and moves take explicit `YYYY-MM-DD`
 * strings so tests run on a fake clock.
 */

import { assertDailyDate } from "./daily.js";
import { isExplicitDate, type DocumentIndexEntry } from "../index/document.js";

export type CalendarMode = "day" | "week" | "month";

export type CalendarEventItem = {
  relativePath: string;
  title: string;
  /** Normalized start (`YYYY-MM-DD` or `YYYY-MM-DDTHH:MM[:SS]`). */
  start: string;
  /** Normalized end, when present and valid. */
  end?: string;
  /** Date part of `start` — the day the event belongs to. */
  startDate: string;
};

export type CalendarTaskItem = {
  relativePath: string;
  /** 1-based file line of the task. */
  line: number;
  description: string;
  /** Normalized `@scheduled` value (date, or date + time). */
  scheduled: string;
  /** Date part of `scheduled` — the day blocking calendar time. */
  scheduledDate: string;
  due?: string;
};

export type CalendarDay = {
  date: string;
  events: CalendarEventItem[];
  tasks: CalendarTaskItem[];
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseParts(date: string): { year: number; month: number; day: number } {
  const parts = assertDailyDate(date);
  if (!parts) throw new Error("Date must be YYYY-MM-DD.");
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

/** Shift a calendar date by whole days (local noon: DST-safe). */
export function addDays(date: string, delta: number): string {
  const { year, month, day } = parseParts(date);
  const d = new Date(year, month - 1, day, 12);
  d.setDate(d.getDate() + delta);
  return formatDate(d);
}

/** Monday..Sunday week containing `anchor`. */
export function weekRange(anchor: string): { start: string; end: string } {
  const { year, month, day } = parseParts(anchor);
  const d = new Date(year, month - 1, day, 12);
  const dow = (d.getDay() + 6) % 7;
  const start = addDays(anchor, -dow);
  return { start, end: addDays(start, 6) };
}

/** First..last day of the calendar month containing `anchor`. */
export function monthRange(anchor: string): { start: string; end: string } {
  const { year, month } = parseParts(anchor);
  const start = `${year}-${pad2(month)}-01`;
  const last = new Date(year, month, 0).getDate();
  return { start, end: `${year}-${pad2(month)}-${pad2(last)}` };
}

/** Range for a calendar mode around `anchor`. */
export function rangeForMode(mode: CalendarMode, anchor: string): { start: string; end: string } {
  if (mode === "day") {
    parseParts(anchor);
    return { start: anchor, end: anchor };
  }
  if (mode === "week") return weekRange(anchor);
  return monthRange(anchor);
}

/** `YYYY-MM-DD` with an optional `T`/space `HH:MM[:SS]` and optional
 * `Z`/offset suffix (ADR-0011: ISO-8601 with offset). Range-checked like the
 * shared gate, but offset-tolerant — the index parser stays strict. */
const EVENT_START_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\s*(?:Z|[+-]\d{2}:?\d{2}))?)?$/;

function normalizeEventValue(raw: string): string | null {
  const m = EVENT_START_RE.exec(raw.trim());
  if (!m) return null;
  if (!assertDailyDate(`${m[1]}-${m[2]}-${m[3]}`)) return null;
  if (m[4] === undefined) return `${m[1]}-${m[2]}-${m[3]}`;
  const hh = Number(m[4]);
  const mm = Number(m[5]);
  const ss = m[6] === undefined ? 0 : Number(m[6]);
  if (hh > 23 || mm > 59 || ss > 59) return null;
  // Group by the date as written; the offset rides along for display only.
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}${m[6] === undefined ? "" : `:${m[6]}`}`;
}

function asDateTimeString(value: unknown): string | null {
  if (typeof value === "string") return normalizeEventValue(value);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${formatDate(value)}T${pad2(value.getHours())}:${pad2(value.getMinutes())}`;
  }
  return null;
}

/** Normalized `start` of an event note, or null (wrong type, missing, invalid). */
export function eventStartOf(entry: DocumentIndexEntry): string | null {
  if (entry.docType !== "event") return null;
  return asDateTimeString(entry.frontmatter["start"]);
}

/** Normalized `end` of an event note, or undefined when absent/invalid. */
export function eventEndOf(entry: DocumentIndexEntry): string | undefined {
  if (entry.docType !== "event") return undefined;
  return asDateTimeString(entry.frontmatter["end"]) ?? undefined;
}

function eventTitle(entry: DocumentIndexEntry): string {
  return entry.title ?? entry.relativePath.replace(/\\/g, "/").split("/").pop() ?? entry.relativePath;
}

/** One `CalendarDay` per date in `[start, end]` (inclusive). Throws on bad input. */
export function collectCalendarRange(entries: DocumentIndexEntry[], start: string, end: string): CalendarDay[] {
  parseParts(start);
  parseParts(end);
  if (start > end) throw new Error("Calendar range start must not be after end.");
  const days = new Map<string, CalendarDay>();
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    days.set(cursor, { date: cursor, events: [], tasks: [] });
  }
  for (const entry of entries) {
    const eventStart = eventStartOf(entry);
    if (eventStart !== null) {
      const day = days.get(eventStart.slice(0, 10));
      if (day) {
        day.events.push({
          relativePath: entry.relativePath,
          title: eventTitle(entry),
          start: eventStart,
          ...(eventEndOf(entry) === undefined ? {} : { end: eventEndOf(entry)! }),
          startDate: eventStart.slice(0, 10),
        });
      }
    }
    for (const task of entry.tasks) {
      if (task.completed || task.scheduled === undefined) continue;
      const day = days.get(task.scheduled.slice(0, 10));
      if (!day) continue;
      day.tasks.push({
        relativePath: entry.relativePath,
        line: task.line,
        description: task.description,
        scheduled: task.scheduled,
        scheduledDate: task.scheduled.slice(0, 10),
        ...(task.due === undefined ? {} : { due: task.due }),
      });
    }
  }
  const out = [...days.values()];
  for (const day of out) {
    day.events.sort((a, b) => a.start.localeCompare(b.start) || a.relativePath.localeCompare(b.relativePath));
    day.tasks.sort((a, b) => a.scheduled.localeCompare(b.scheduled) || a.relativePath.localeCompare(b.relativePath) || a.line - b.line);
  }
  return out;
}

const SCHEDULED_TOKEN_RE = /@scheduled\(([^)]*)\)/g;

/** Rewrite only the `@scheduled` token(s) on one task line for `targetDate`.
 * The time-of-day suffix survives the move (`2026-10-06T14:00` → `2026-10-08T14:00`);
 * a line without the token gains ` @scheduled(targetDate)`. `@due` and every
 * other byte are untouched. Throws on a bad target date. */
export function rewriteScheduledToken(line: string, targetDate: string): string {
  if (!assertDailyDate(targetDate)) throw new Error("Target date must be YYYY-MM-DD.");
  SCHEDULED_TOKEN_RE.lastIndex = 0;
  if (!SCHEDULED_TOKEN_RE.test(line)) {
    SCHEDULED_TOKEN_RE.lastIndex = 0;
    return `${line.replace(/\s+$/, "")} @scheduled(${targetDate})`;
  }
  SCHEDULED_TOKEN_RE.lastIndex = 0;
  return line.replace(SCHEDULED_TOKEN_RE, (_match, raw: string) => {
    const value = String(raw).trim();
    const suffix = isExplicitDate(value) && value.length > 10 ? value.slice(10) : "";
    return `@scheduled(${targetDate}${suffix})`;
  });
}
