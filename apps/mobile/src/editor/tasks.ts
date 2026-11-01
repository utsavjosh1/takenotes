/**
 * M2 — Preview + task toggle (thin modules over core).
 *
 * Source is truth (ADR-0008); `renderMarkdown()` is preview only — same
 * split as desktop Step 1. Task taps flip the checkbox via
 * `toggleTaskCheckboxAtLine` and save with `expectedRevision` (CONFLICT
 * when stale — the toggle never force-writes).
 */

import type { AppError } from "@takenotes/contracts/errors";
import type { FileRevision } from "@takenotes/contracts/ipc";
import { renderMarkdown, toggleTaskCheckboxAtLine, type RenderedMarkdown } from "@takenotes/core/markdown/render";
import type { MobileWorkspace } from "../workspace/mobile-workspace.js";

export type { RenderedMarkdown };

/** Preview HTML for the preview tab / WebView. Source stays canonical. */
export function renderPreview(content: string): RenderedMarkdown {
  return renderMarkdown(content);
}

export async function toggleTask(
  ws: MobileWorkspace,
  relativePath: string,
  /** 1-based line number of the task in the source. */
  line: number,
): Promise<{ revision: FileRevision; content: string } | { error: AppError }> {
  const read = await ws.read(relativePath);
  if ("error" in read) return { error: read.error };
  const next = toggleTaskCheckboxAtLine(read.result.content, line);
  if (next === null) {
    return { error: { code: "INVALID_REQUEST", message: `Line ${line} is not a task.` } as AppError };
  }
  const updated = await ws.update(
    relativePath,
    next,
    read.result.revision.hash,
    read.result.newlineStyle,
    read.result.hadBom,
  );
  if ("error" in updated) return { error: updated.error };
  return { revision: updated.revision, content: next };
}
