/**
 * M3 — Import / export (thin module over core policy).
 *
 * V1 scope (honest boundary): Markdown + plain text only
 * (`.md`, `.markdown`, `.txt` — the desktop Step 8 set minus Textbundle/HTML,
 * which need attachment mapping). Anything else (images, PDFs, binaries) is
 * skipped with a reason, never silently dropped or half-imported. Attachments
 * are a later phase with their own naming/collision policy.
 *
 * Rules (mirror desktop external-drop):
 *  - Copy-in, never move, never overwrite: `name.md` → `name 1.md` via
 *    core `uniqueCopyName` (case-insensitive), one retry on an
 *    `ALREADY_EXISTS` race.
 *  - Strict UTF-8 (fatal decode; NUL → skip). Bytes reach the revision-safe
 *    string path or they don't reach the workspace at all.
 *  - Export is a read: `{ filename, mime, content }` for the share sheet.
 *    The sheet itself is the binding (`expo-share-binding.ts`).
 *
 * RN-safe: `TextDecoder` only (Hermes ≥0.73 provides it). No `Buffer`.
 */

import type { AppError } from "@takenotes/contracts/errors";
import type { FileRevision } from "@takenotes/contracts/ipc";
import { MAX_FILE_BYTES, validatePosixRelativePath } from "@takenotes/core/policy/note-policy";
import { uniqueCopyName } from "@takenotes/core/explorer/sort";
import type { DirectoryListing } from "../adapters/listing.js";
import type { MobileWorkspace } from "../workspace/mobile-workspace.js";

const TEXT_EXTENSIONS = new Set([".md", ".markdown", ".txt"]);

export type IncomingFile = {
  /** Original filename as reported by the picker (may include path parts). */
  name: string;
  bytes: Uint8Array;
};

export type ImportedFile = { relativePath: string; name: string };
export type SkippedFile = { name: string; reason: string };

export type ImportResult = { imported: ImportedFile[]; skipped: SkippedFile[] };

function basenameOf(name: string): string {
  return name.replaceAll("\\", "/").split("/").filter(Boolean).pop() ?? "";
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

function decodeStrict(bytes: Uint8Array): string | null {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return text.includes("\0") ? null : text;
  } catch {
    return null;
  }
}

function joinAbs(root: string, rel: string): string {
  const base = root.replace(/\/+$/, "");
  return rel ? `${base}/${rel}` : base;
}

export async function importFiles(
  ws: MobileWorkspace,
  lister: DirectoryListing,
  root: string,
  /** Target folder rel (`""` = workspace root). Created on demand. */
  dir: string,
  files: readonly IncomingFile[],
): Promise<ImportResult> {
  const out: ImportResult = { imported: [], skipped: [] };
  const dirV = dir === "" ? { relativePath: "" } : validatePosixRelativePath(dir);
  if ("error" in dirV) {
    const reason = `Target folder is invalid: ${dirV.error.message}`;
    return { imported: [], skipped: files.map((f) => ({ name: f.name, reason })) };
  }
  const targetDir = dirV.relativePath;
  for (const file of files) {
    const clean = basenameOf(file.name);
    if (!clean || clean === "." || clean === "..") {
      out.skipped.push({ name: file.name, reason: "That filename is not usable." });
      continue;
    }
    if (file.bytes.length > MAX_FILE_BYTES) {
      out.skipped.push({ name: file.name, reason: "This file is too large to import safely." });
      continue;
    }
    if (!TEXT_EXTENSIONS.has(extensionOf(clean))) {
      out.skipped.push({ name: file.name, reason: "Only Markdown and text files can be imported in V1." });
      continue;
    }
    const text = decodeStrict(file.bytes);
    if (text === null) {
      out.skipped.push({ name: file.name, reason: "This file is not valid UTF-8 text." });
      continue;
    }
    // Collision-safe name against the live directory (case-insensitive).
    const pickName = async (): Promise<string> => {
      let existing = new Set<string>();
      try {
        existing = new Set((await lister.listDirectory(joinAbs(root, targetDir))).map((e) => e.name.toLowerCase()));
      } catch {
        /* unreadable dir reads as empty — create() validates downstream */
      }
      return uniqueCopyName(clean, existing);
    };
    const place = async (name: string): Promise<{ revision: FileRevision } | { error: AppError }> => {
      const rel = targetDir ? `${targetDir}/${name}` : name;
      return ws.create(rel, text);
    };
    let name = await pickName();
    let res = await place(name);
    if ("error" in res && res.error.code === "ALREADY_EXISTS") {
      name = await pickName(); // lost a race — re-read the dir, try once more
      res = await place(name);
    }
    if ("error" in res) {
      out.skipped.push({ name: file.name, reason: res.error.message });
      continue;
    }
    out.imported.push({ relativePath: targetDir ? `${targetDir}/${name}` : name, name });
  }
  return out;
}

const MIME_BY_EXT: Record<string, string> = {
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".txt": "text/plain",
};

export type SharePayload = { filename: string; mime: string; content: string };

export async function readForShare(
  ws: MobileWorkspace,
  relativePath: string,
): Promise<{ payload: SharePayload } | { error: AppError }> {
  const read = await ws.read(relativePath);
  if ("error" in read) return { error: read.error };
  const base = relativePath.slice(relativePath.lastIndexOf("/") + 1);
  return {
    payload: {
      filename: base,
      mime: MIME_BY_EXT[extensionOf(base)] ?? "text/plain",
      content: read.result.content,
    },
  };
}
