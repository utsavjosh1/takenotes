/**
 * M2 — Quick Capture + Daily + Today (thin modules over core productivity).
 *
 * - Capture appends `- [ ] text @due(…)` to `Inbox.md` (created on first
 *   use). One CONFLICT retry: re-read, re-append, re-update.
 * - Daily notes are explicit-only (`ensureDailyNote` creates
 *   `Daily/YYYY/MM/YYYY-MM-DD.md` with `type: daily, date:` frontmatter via
 *   core templates). Missing daily = caller shows `[ Create Today's Note ]`
 *   — `getToday` never creates.
 * - Today aggregates overdue/due-today/`@scheduled` over the index plus the
 *   Daily embed (content or null), recent notes left to the caller.
 */

import type { AppError } from "@takenotes/contracts/errors";
import type { FileRevision } from "@takenotes/contracts/ipc";
import { appendTaskLine, formatTaskLine, INBOX_RELATIVE_PATH } from "@takenotes/core/productivity/tasks";
import {
  assertDailyDate,
  dailyNoteContent,
  dailyNotePath,
  localDateParts,
} from "@takenotes/core/productivity/daily";
import { collectTodayTasks, type TodayGroups } from "@takenotes/core/productivity/today";
import type { WorkspaceIndex } from "@takenotes/core/index/store";
import type { MobileWorkspace } from "../workspace/mobile-workspace.js";

export { INBOX_RELATIVE_PATH };
export type { TodayGroups };

export async function captureToInbox(
  ws: MobileWorkspace,
  text: string,
  due?: string,
): Promise<{ revision: FileRevision } | { error: AppError }> {
  let line: string;
  try {
    line = formatTaskLine(text, due);
  } catch (err) {
    return { error: { code: "INVALID_REQUEST", message: err instanceof Error ? err.message : String(err) } as AppError };
  }
  const attempt = async (): Promise<{ revision: FileRevision } | { error: AppError } | { retry: true }> => {
    const read = await ws.read(INBOX_RELATIVE_PATH);
    if ("error" in read) {
      if (read.error.code !== "NOT_FOUND") return { error: read.error };
      return createInbox(ws, line);
    }
    const updated = await ws.update(
      INBOX_RELATIVE_PATH,
      appendTaskLine(read.result.content, line),
      read.result.revision.hash,
      read.result.newlineStyle,
      read.result.hadBom,
    );
    if ("error" in updated) {
      if (updated.error.code === "CONFLICT") return { retry: true };
      return { error: updated.error };
    }
    return { revision: updated.revision };
  };
  const first = await attempt();
  if (!("retry" in first)) return first;
  const second = await attempt();
  if ("retry" in second) {
    return { error: { code: "CONFLICT", message: "Inbox changed twice during capture. Open Inbox and retry." } as AppError };
  }
  return second;
}

async function createInbox(
  ws: MobileWorkspace,
  line: string,
): Promise<{ revision: FileRevision } | { error: AppError } | { retry: true }> {
  const created = await ws.create(INBOX_RELATIVE_PATH, `${line}\n`);
  if ("error" in created) {
    // Lost the race with another writer (or first-run double-tap): retry
    // through the read→append→update path exactly once.
    if (created.error.code === "ALREADY_EXISTS") return { retry: true };
    return { error: created.error };
  }
  return { revision: created.revision };
}

export async function ensureDailyNote(
  ws: MobileWorkspace,
  input: { date?: string; workspaceName?: string; template?: string } = {},
): Promise<{ relativePath: string; created: boolean } | { error: AppError }> {
  const parts = input.date === undefined ? localDateParts() : assertDailyDate(input.date);
  if (!parts) return { error: { code: "INVALID_REQUEST", message: "Date must be YYYY-MM-DD." } as AppError };
  const rel = dailyNotePath(parts);
  const existing = await ws.read(rel);
  if (!("error" in existing)) return { relativePath: rel, created: false };
  if (existing.error.code !== "NOT_FOUND") return { error: existing.error };
  const content = dailyNoteContent({
    date: parts.isoDate,
    workspaceName: input.workspaceName ?? "notes",
    ...(input.template === undefined ? {} : { template: input.template }),
  });
  const created = await ws.create(rel, content);
  if ("error" in created) {
    if (created.error.code === "ALREADY_EXISTS") return { relativePath: rel, created: false };
    return { error: created.error };
  }
  return { relativePath: rel, created: true };
}

export type TodayView = {
  groups: TodayGroups;
  dailyRelativePath: string;
  /** Null when today's note doesn't exist — UI shows create affordance. */
  dailyContent: string | null;
};

export async function getToday(
  ws: MobileWorkspace,
  index: WorkspaceIndex,
  workspaceId: string,
  today: string,
): Promise<TodayView | { error: AppError }> {
  if (!assertDailyDate(today)) {
    return { error: { code: "INVALID_REQUEST", message: "Today must be YYYY-MM-DD." } as AppError };
  }
  let groups: TodayGroups;
  try {
    groups = collectTodayTasks(index.list(workspaceId), today);
  } catch (err) {
    return { error: { code: "INVALID_REQUEST", message: err instanceof Error ? err.message : String(err) } as AppError };
  }
  const dailyRelativePath = dailyNotePath(today);
  const daily = await ws.read(dailyRelativePath);
  if ("error" in daily) {
    if (daily.error.code !== "NOT_FOUND") return { error: daily.error };
    return { groups, dailyRelativePath, dailyContent: null };
  }
  return { groups, dailyRelativePath, dailyContent: daily.result.content };
}
