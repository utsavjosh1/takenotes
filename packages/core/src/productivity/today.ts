/** Today view query (filesystem-first, no database).
 *
 * Pure derivation over document index entries: overdue + due-today tasks
 * (by `@due`) plus today's time blocks (by `@scheduled`). Completed
 * checkboxes never appear. The caller injects `today` as `YYYY-MM-DD`, so
 * production passes the local calendar date while tests pass a fake clock.
 */

import { assertDailyDate } from "./daily.js";
import type { DocumentIndexEntry } from "../index/document.js";

export type TodayTaskItem = {
  relativePath: string;
  /** 1-based file line of the task. */
  line: number;
  description: string;
  due?: string;
  scheduled?: string;
};

export type TodayGroups = {
  overdue: TodayTaskItem[];
  dueToday: TodayTaskItem[];
  scheduledToday: TodayTaskItem[];
};

function byDueThenPath(a: TodayTaskItem, b: TodayTaskItem): number {
  if ((a.due ?? "") !== (b.due ?? "")) return (a.due ?? "").localeCompare(b.due ?? "");
  if (a.relativePath !== b.relativePath) return a.relativePath.localeCompare(b.relativePath);
  return a.line - b.line;
}

function byScheduledThenPath(a: TodayTaskItem, b: TodayTaskItem): number {
  if ((a.scheduled ?? "") !== (b.scheduled ?? "")) return (a.scheduled ?? "").localeCompare(b.scheduled ?? "");
  if (a.relativePath !== b.relativePath) return a.relativePath.localeCompare(b.relativePath);
  return a.line - b.line;
}

/** Group incomplete tasks around `today` (`YYYY-MM-DD`). Throws on a bad date. */
export function collectTodayTasks(entries: DocumentIndexEntry[], today: string): TodayGroups {
  if (!assertDailyDate(today)) throw new Error("Today must be YYYY-MM-DD.");
  const groups: TodayGroups = { overdue: [], dueToday: [], scheduledToday: [] };
  for (const entry of entries) {
    for (const task of entry.tasks) {
      if (task.completed) continue;
      const item: TodayTaskItem = {
        relativePath: entry.relativePath,
        line: task.line,
        description: task.description,
        ...(task.due === undefined ? {} : { due: task.due }),
        ...(task.scheduled === undefined ? {} : { scheduled: task.scheduled }),
      };
      if (task.due !== undefined) {
        if (task.due < today) groups.overdue.push(item);
        else if (task.due === today) groups.dueToday.push(item);
      }
      if (task.scheduled !== undefined && task.scheduled.slice(0, 10) === today) {
        groups.scheduledToday.push(item);
      }
    }
  }
  groups.overdue.sort(byDueThenPath);
  groups.dueToday.sort(byDueThenPath);
  groups.scheduledToday.sort(byScheduledThenPath);
  return groups;
}
