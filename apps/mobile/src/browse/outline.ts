/**
 * M1 — Outline + page preview (thin module over core extract).
 *
 * Live-parse of the active note only — no index dependency (same contract
 * as desktop Step 2). Preview shows the first ~20 lines via core's
 * `previewExcerpt`, footer shows the full path for disambiguation.
 */

import type { AppError } from "@takenotes/contracts/errors";
import { extractAtxHeadings, previewExcerpt, type OutlineHeading } from "@takenotes/core/outline/extract";
import type { MobileWorkspace } from "../workspace/mobile-workspace.js";

export type { OutlineHeading };

export async function getOutline(
  ws: MobileWorkspace,
  relativePath: string,
): Promise<{ headings: OutlineHeading[] } | { error: AppError }> {
  const out = await ws.read(relativePath);
  if ("error" in out) return { error: out.error };
  return { headings: extractAtxHeadings(out.result.content) };
}

export async function getPreview(
  ws: MobileWorkspace,
  relativePath: string,
): Promise<{ excerpt: string; relativePath: string } | { error: AppError }> {
  const out = await ws.read(relativePath);
  if ("error" in out) return { error: out.error };
  return { excerpt: previewExcerpt(out.result.content), relativePath };
}
