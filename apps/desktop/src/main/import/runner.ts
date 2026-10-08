/** Step 8 import runner (Phase 5f): outside-files → workspace, main side.
 *
 * Renderer never sees outside absolute paths (ADR-0009): `pickImport`
 * opens the dialog, reads the bundle (bounded), plans via the pure core
 * planner, and caches the plan under a single-use token. The preview
 * carries target paths + sizes + unmapped refs (no outside paths, no
 * bytes). `confirmImport` executes through `NoteService` (revisioned,
 * watcher-visible) and drops the token.
 *
 * Bounds: ≤1000 bundle entries walked, text ≤1 MiB, assets ≤25 MiB each
 * (the 100 MiB `importBinary` cap is the backstop). Skips report with
 * reasons; per-file failures record and continue — the summary, not an
 * exception, is the result. WSL workspaces import notes normally;
 * binary attachments honestly refuse per file (string-based helper).
 */
import { appError, type AppError } from "@takenotes/contracts/errors";
import { planImport, type ImportPlan, type ImportSourceFile } from "@takenotes/core/import/plan";
import type { AttachmentLocation } from "@takenotes/core/attachments/import";
import { dialog, type BrowserWindow } from "electron";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { NoteService } from "../services/note-service.js";
import type { WorkspaceService } from "../services/workspace-service.js";

export const MAX_IMPORT_WALK_FILES = 1000;
export const MAX_IMPORT_TEXT_BYTES = 1024 * 1024;
export const MAX_IMPORT_ASSET_BYTES = 25 * 1024 * 1024;
const TOKEN_TTL_MS = 15 * 60 * 1000;

export type ImportPickOptions = {
  mode: "files" | "folder";
  attachmentLocation: AttachmentLocation;
  attachmentFolder: string;
};

export type ImportPreview = {
  token: string;
  notes: { targetPath: string; sourceRel: string; chars: number }[];
  attachments: { targetPath: string; sourceRel: string; bytes: number }[];
  unmapped: { note: string; ref: string }[];
  warnings: string[];
  skipped: { rel: string; reason: string }[];
};

export type ImportSummary = {
  notes: number;
  attachments: number;
  errors: { target: string; message: string }[];
};

type CachedPlan = {
  plan: ImportPlan;
  /** Bundle abs path per lowercased source rel (assets re-read on confirm). */
  absByRel: Map<string, string>;
  createdAt: number;
};

const pending = new Map<string, CachedPlan>();

function planCacheSet(plan: ImportPlan, absByRel: Map<string, string>): string {
  const token = randomUUID();
  pending.set(token, { plan, absByRel, createdAt: Date.now() });
  if (pending.size > 8) {
    const oldest = [...pending.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
    if (oldest) pending.delete(oldest[0]);
  }
  return token;
}

function planCacheTake(token: string): CachedPlan | null {
  const cached = pending.get(token);
  if (!cached) return null;
  pending.delete(token);
  if (Date.now() - cached.createdAt > TOKEN_TTL_MS) return null;
  return cached;
}

async function walkBundle(root: string): Promise<{ rel: string; abs: string; dirent: "file" | "dir" }[]> {
  const out: { rel: string; abs: string; dirent: "file" | "dir" }[] = [];
  const queue: { abs: string; rel: string }[] = [{ abs: root, rel: "" }];
  while (queue.length > 0 && out.length < MAX_IMPORT_WALK_FILES) {
    const current = queue.shift()!;
    let entries;
    try {
      entries = await readdir(current.abs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const abs = join(current.abs, entry.name);
      const rel = current.rel ? `${current.rel}/${entry.name}` : entry.name;
      let st;
      try {
        st = await lstat(abs);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        queue.push({ abs, rel });
      } else if (st.isFile()) {
        out.push({ rel, abs, dirent: "file" });
        if (out.length >= MAX_IMPORT_WALK_FILES) break;
      }
    }
  }
  return out;
}

function classifyBundleFile(rel: string): "markdown" | "html" | "asset" | "skip" {
  const lower = rel.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".mdown")) return "markdown";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  return "asset";
}

function decodeText(bytes: Buffer): { text: string; lossy: boolean } | null {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { text: text.replace(/^\uFEFF/, ""), lossy: false };
  } catch {
    try {
      return { text: Buffer.from(bytes).toString("latin1"), lossy: true };
    } catch {
      return null;
    }
  }
}

async function readBundleEntry(
  abs: string,
  kind: "markdown" | "html" | "asset",
): Promise<{ text?: string; bytes?: number; skipped?: string; lossy?: boolean }> {
  let st;
  try {
    st = await lstat(abs);
  } catch {
    return { skipped: "unreadable" };
  }
  if (kind === "asset") {
    if (st.size > MAX_IMPORT_ASSET_BYTES) return { skipped: `over the 25 MiB asset cap (${st.size} bytes)` };
    return { bytes: st.size };
  }
  if (st.size > MAX_IMPORT_TEXT_BYTES) return { skipped: `over the 1 MiB text cap (${st.size} bytes)` };
  let bytes;
  try {
    bytes = await readFile(abs);
  } catch {
    return { skipped: "unreadable" };
  }
  const decoded = decodeText(bytes);
  if (!decoded) return { skipped: "unsupported encoding" };
  return { text: decoded.text, lossy: decoded.lossy };
}

async function existingLower(workspaces: WorkspaceService, notes: NoteService, workspaceId: string): Promise<Set<string> | { error: AppError }> {
  const reg = workspaces.get(workspaceId);
  if (!reg) return { error: appError("NOT_FOUND", "Workspace not found.") };
  const found = new Set<string>();
  const queue = [""];
  while (queue.length > 0) {
    const dir = queue.shift()!;
    const listed = await notes.listTree(workspaceId, dir);
    if ("error" in listed) return listed;
    for (const entry of listed.entries) {
      if (entry.kind === "directory") queue.push(entry.relativePath);
      else {
        found.add(entry.relativePath.toLowerCase());
        if (found.size > 30000) return found;
      }
    }
  }
  return found;
}

function validAttachmentOpts(input: unknown): { location: AttachmentLocation; folder: string } | null {
  if (typeof input !== "object" || input === null) return null;
  const { attachmentLocation, attachmentFolder } = input as Record<string, unknown>;
  if (
    attachmentLocation !== "root" &&
    attachmentLocation !== "same-folder" &&
    attachmentLocation !== "subfolder" &&
    attachmentLocation !== "folder"
  ) {
    return null;
  }
  if (typeof attachmentFolder !== "string") return null;
  return { location: attachmentLocation, folder: attachmentFolder };
}

export function createImportRunner(deps: { workspaces: WorkspaceService; notes: NoteService }): {
  pickImport(
    win: BrowserWindow | null,
    workspaceId: unknown,
    options: unknown,
  ): Promise<{ preview: ImportPreview } | { error: AppError }>;
  confirmImport(
    workspaceId: unknown,
    token: unknown,
  ): Promise<{ summary: ImportSummary } | { error: AppError }>;
} {
  return {
    async pickImport(win, workspaceId, options) {
      if (typeof workspaceId !== "string" || !workspaceId) {
        return { error: appError("INVALID_REQUEST", "Workspace id required.") };
      }
      if (typeof options !== "object" || options === null) {
        return { error: appError("INVALID_REQUEST", "Import options required.") };
      }
      const { mode, attachmentLocation, attachmentFolder } = options as {
        mode?: unknown;
        attachmentLocation?: unknown;
        attachmentFolder?: unknown;
      };
      if (mode !== "files" && mode !== "folder") {
        return { error: appError("INVALID_REQUEST", 'Import mode is "files" or "folder".') };
      }
      const attachment = validAttachmentOpts({ attachmentLocation, attachmentFolder });
      if (!attachment) return { error: appError("INVALID_REQUEST", "Invalid attachment options.") };
      if (!win || win.isDestroyed()) {
        return { error: appError("INVALID_REQUEST", "Import needs a window for the picker.") };
      }

      const picked =
        mode === "files"
          ? await dialog.showOpenDialog(win, {
              properties: ["openFile", "multiSelections"],
              filters: [
                { name: "Notes", extensions: ["md", "markdown", "mdown", "html", "htm"] },
                { name: "All files", extensions: ["*"] },
              ],
            })
          : await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
      if (picked.canceled || picked.filePaths.length === 0) {
        return { error: appError("CANCELLED", "Import cancelled.") };
      }

      const entries: { rel: string; abs: string }[] =
        mode === "files"
          ? picked.filePaths.map((abs) => ({ rel: abs.split(/[/\\]/).pop() ?? "import.md", abs }))
          : (await walkBundle(picked.filePaths[0]!)).filter((e) => e.dirent === "file");

      const sources: ImportSourceFile[] = [];
      const skipped: { rel: string; reason: string }[] = [];
      const absByRel = new Map<string, string>();
      const warnings: string[] = [];
      for (const entry of entries) {
        const rel = entry.rel.replace(/\\/g, "/");
        const kind = classifyBundleFile(rel);
        if (kind === "skip") {
          skipped.push({ rel, reason: "unsupported kind" });
          continue;
        }
        const read = await readBundleEntry(entry.abs, kind);
        if (read.skipped) {
          skipped.push({ rel, reason: read.skipped });
          continue;
        }
        if (read.lossy) warnings.push(`${rel}: decoded as Latin-1 (not valid UTF-8) — check special characters.`);
        absByRel.set(rel.toLowerCase(), entry.abs);
        sources.push(
          kind === "asset"
            ? { rel, kind }
            : { rel, kind, text: read.text ?? "" },
        );
      }

      const existing = await existingLower(deps.workspaces, deps.notes, workspaceId);
      if ("error" in existing) return existing;
      const plan = planImport(sources, {
        attachmentLocation: attachment.location,
        attachmentFolder: attachment.folder,
        existingLower: existing,
      });
      for (const skip of skipped) plan.skipped.push(skip);
      for (const warning of warnings) plan.warnings.push(warning);

      // Sizes for the confirm screen (assets re-read on confirm).
      const assetBytes = new Map<string, number>();
      for (const attachment of plan.attachments) {
        const abs = absByRel.get(attachment.sourceRel.toLowerCase());
        if (!abs) continue;
        try {
          assetBytes.set(attachment.sourceRel, (await lstat(abs)).size);
        } catch {
          assetBytes.set(attachment.sourceRel, 0);
        }
      }

      const token = planCacheSet(plan, absByRel);
      return {
        preview: {
          token,
          notes: plan.notes.map((n) => ({ targetPath: n.targetPath, sourceRel: n.sourceRel, chars: n.content.length })),
          attachments: plan.attachments.map((a) => ({
            targetPath: a.targetPath,
            sourceRel: a.sourceRel,
            bytes: assetBytes.get(a.sourceRel) ?? 0,
          })),
          unmapped: plan.unmapped,
          warnings: plan.warnings,
          skipped: plan.skipped,
        },
      };
    },

    async confirmImport(workspaceId, token) {
      if (typeof workspaceId !== "string" || !workspaceId) {
        return { error: appError("INVALID_REQUEST", "Workspace id required.") };
      }
      if (typeof token !== "string" || !token) {
        return { error: appError("INVALID_REQUEST", "Import token required.") };
      }
      const cached = planCacheTake(token);
      if (!cached) return { error: appError("INVALID_REQUEST", "Import expired or already applied.") };
      const reg = deps.workspaces.get(workspaceId);
      if (!reg) return { error: appError("NOT_FOUND", "Workspace not found.") };

      const summary: ImportSummary = { notes: 0, attachments: 0, errors: [] };
      for (const note of cached.plan.notes) {
        const created = await deps.notes.createFile(workspaceId, note.targetPath, note.content);
        if ("error" in created) {
          summary.errors.push({ target: note.targetPath, message: created.error.message });
        } else {
          summary.notes += 1;
        }
      }
      for (const attachment of cached.plan.attachments) {
        const abs = cached.absByRel.get(attachment.sourceRel.toLowerCase());
        if (!abs) {
          summary.errors.push({ target: attachment.targetPath, message: "Source file vanished." });
          continue;
        }
        let bytes: Buffer;
        try {
          const st = await lstat(abs);
          if (st.size > MAX_IMPORT_ASSET_BYTES) {
            summary.errors.push({ target: attachment.targetPath, message: "Over the 25 MiB asset cap." });
            continue;
          }
          bytes = await readFile(abs);
        } catch {
          summary.errors.push({ target: attachment.targetPath, message: "Could not read source file." });
          continue;
        }
        const written = await deps.notes.importBinary(workspaceId, attachment.targetPath, bytes);
        if ("error" in written) {
          summary.errors.push({ target: attachment.targetPath, message: written.error.message });
        } else {
          summary.attachments += 1;
        }
      }
      return { summary };
    },
  };
}

export type ImportRunner = ReturnType<typeof createImportRunner>;

/** Test-only seam: cache a plan built by the caller (pickImport's dialog
 * half is untestable headless). Returns a single-use token for
 * `confirmImport`, exactly like a real pick. */
export function cachePlanForTest(plan: ImportPlan, absByRel: Map<string, string>): string {
  return planCacheSet(plan, absByRel);
}
