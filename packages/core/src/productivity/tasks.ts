/** Task capture (filesystem-first, no database).
 *
 * A task is an ordinary Markdown checkbox line. Capture appends
 * `- [ ] text @due(YYYY-MM-DD)` to the target note — the file stays
 * authoritative and the document index re-parses it like any other edit.
 * Due dates are strict calendar dates (`YYYY-MM-DD`); there is deliberately
 * no natural-language parsing and no recurrence in V1.
 */

export type TaskCaptureTarget = "daily" | "inbox";

export const INBOX_RELATIVE_PATH = "Inbox.md";

const DUE_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Strict `YYYY-MM-DD` calendar date (leap-year aware). No NLP, no times. */
export function isTaskDueDate(value: string): boolean {
  const m = DUE_DATE_RE.exec(value.trim());
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
  return day >= 1 && day <= days;
}

/** Collapse whitespace/newlines so one capture is always one line. */
function singleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** `- [ ] text` plus ` @due(YYYY-MM-DD)` when a due date is given.
 * Throws on empty text or an invalid due date — callers validate first
 * to show inline errors instead of catching. */
export function formatTaskLine(text: string, due?: string): string {
  const clean = singleLine(text);
  if (!clean) throw new Error("Task text is empty.");
  const dueDate = due?.trim() ? due.trim() : undefined;
  if (dueDate !== undefined && !isTaskDueDate(dueDate)) throw new Error("Due date must be YYYY-MM-DD.");
  return dueDate === undefined ? `- [ ] ${clean}` : `- [ ] ${clean} @due(${dueDate})`;
}

/** Append a task line to note content, preserving a trailing newline. */
export function appendTaskLine(content: string, line: string): string {
  if (!content) return `${line}\n`;
  return content.endsWith("\n") ? `${content}${line}\n` : `${content}\n${line}\n`;
}
