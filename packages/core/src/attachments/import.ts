import { uniqueCopyName } from "../explorer/sort";
import { formatMarkdownLink, formatWikilink, type LinkFormat } from "../links/completion";

/** Attachment import policy (Step 4).
 *
 * Pure, total, host-independent: filenames in, workspace-relative paths
 * and insertion text out. Bytes never cross this module — the service
 * layer moves them, this module decides where they land and how they are
 * referenced. Every function degrades to null/skip, never throws.
 */

export type AttachmentKind = "image" | "audio" | "video" | "pdf" | "unsupported";

const IMAGE_EXT = new Set(["avif", "bmp", "gif", "jpg", "jpeg", "png", "svg", "webp"]);
const AUDIO_EXT = new Set(["flac", "m4a", "mp3", "ogg", "wav", "webm", "3gp"]);
const VIDEO_EXT = new Set(["mkv", "mov", "mp4", "ogv", "webm"]);
const PDF_EXT = new Set(["pdf"]);

function extOf(filename: string): string {
  const base = filename.replace(/\\/g, "/").split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

/** Classify by extension (roadmap allowlist). Extensionless files and
 * anything off the list are `unsupported` — linked or skipped per
 * setting, never embedded. */
export function classifyAttachment(filename: string): AttachmentKind {
  const ext = extOf(filename);
  if (!ext) return "unsupported";
  if (IMAGE_EXT.has(ext)) return "image";
  // `webm` sits in both sets: video wins (the renderer agrees).
  if (VIDEO_EXT.has(ext)) return "video";
  if (AUDIO_EXT.has(ext)) return "audio";
  if (PDF_EXT.has(ext)) return "pdf";
  return "unsupported";
}

export type AttachmentLocation = "root" | "same-folder" | "subfolder" | "folder";

export const ATTACHMENT_LOCATIONS: readonly AttachmentLocation[] = ["root", "same-folder", "subfolder", "folder"];

/** Sanitize a configured folder (root-relative): backslashes fold,
 * dot segments drop, `..`/absolute/NUL refuse. Returns null when the
 * configured value cannot become a safe root-relative directory. */
function cleanFolder(raw: string): string | null {
  if (raw.includes("\0")) return null;
  const trimmed = raw.replace(/\\/g, "/").trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed || trimmed === "." || trimmed === "/") return "";
  const segs = trimmed.split("/").filter((s) => s !== "" && s !== ".");
  if (segs.length === 0) return "";
  if (segs.some((s) => s === "..")) return null;
  return segs.join("/");
}

function parentDirOf(notePath: string): string {
  const p = notePath.replace(/\\/g, "/");
  const i = p.lastIndexOf("/");
  return i < 0 ? "" : p.slice(0, i);
}

/** Resolve the attachment directory ("" = workspace root) for a note.
 * `notePath` "" (sidebar drops with no active note) degrades same-folder
 * and subfolder to the root level — never null, never outside the root. */
export function resolveAttachmentDir(
  mode: AttachmentLocation,
  attachmentFolder: string,
  notePath: string,
): string | null {
  const noteDir = parentDirOf(notePath);
  switch (mode) {
    case "root":
      return "";
    case "same-folder":
      return noteDir;
    case "subfolder": {
      const sub = cleanFolder(attachmentFolder) || "attachments";
      if (sub === "") return noteDir;
      return noteDir ? `${noteDir}/${sub}` : sub;
    }
    case "folder": {
      const folder = cleanFolder(attachmentFolder);
      return folder === null ? null : folder;
    }
  }
}

/** Collision-free filename within one directory: `pic.png` → `pic 1.png`
 * (case-insensitive, per-directory — the existing `uniqueCopyName` rule). */
export function attachmentFileName(originalName: string, existingLower: Set<string>): string {
  return uniqueCopyName(originalName, existingLower);
}

/** Fallback name for unnamed clipboard items (screenshots): timestamped,
 * deterministic per instant, collision handling still applies on top. */
export function pastedFileName(ext: string, now: Date = new Date()): string {
  const clean = ext.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `pasted-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.${clean}`;
}

export type UnsupportedPolicy = "link" | "skip";

/** Insertion text for an imported file. Supported kinds embed
 * (`![[…]]`, always wikilink form — embed sizing arrives with
 * attachments, Markdown-image generation is deferred); unsupported kinds
 * link (`[[…]]`, Markdown form when wikilinks are off) or refuse (null)
 * under the skip policy. */
export function buildAttachmentLink(
  rel: string,
  notePath: string,
  format: LinkFormat,
  useWikilinks: boolean,
  kind: AttachmentKind,
  unsupported: UnsupportedPolicy,
): string | null {
  if (kind === "unsupported" && unsupported === "skip") return null;
  const label = rel.split("/").pop() ?? rel;
  if (kind !== "unsupported") return `![[${formatWikilink(rel, notePath, format)}]]`;
  return useWikilinks
    ? `[[${formatWikilink(rel, notePath, format)}]]`
    : formatMarkdownLink(rel, label, notePath, format);
}
