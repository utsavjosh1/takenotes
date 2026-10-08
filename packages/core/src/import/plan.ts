/** Step 8 import planner (Phase 5f): bundle → workspace plan, pure + total.
 *
 * Inputs are caller-provided file lists (bytes never cross this module):
 * Markdown notes, HTML notes (converted via `./html`), and asset files.
 * Covers picked files, picked folders, and Textbundle dirs (`*.textbundle/
 * text.md` names its note after the bundle). Outputs note targets with
 * converted content plus attachment mappings — the host copies bytes and
 * writes notes, this module decides where everything lands and how links
 * are rewritten. Every function degrades to skip/warn, never throws.
 *
 * Link conversion:
 * - `[t](relative)` → imported note: path rewritten to its target.
 * - `[t](relative)` / `![a](relative)` → bundled asset: copied under the
 *   attachment policy dir, ref rewritten to the new workspace path.
 * - Remote (`http/https/mailto/data:`), absolute (`/x`), and `#anchor`
 *   refs: kept as-is (`unmapped` records them for the confirm screen).
 * - `[[wikilinks]]`: untouched (workspace semantics resolve post-import).
 * - Remote images are never fetched (no network in V1) — kept + warned.
 *
 * Bounds: at most `MAX_IMPORT_NOTES` notes; anything else is `skipped`
 * with a reason. Name collisions (vs existing + within the plan) resolve
 * per-directory (`pic 1.png` rule) — never overwrite, never merge.
 */
import {
  attachmentFileName,
  resolveAttachmentDir,
  type AttachmentLocation,
} from "../attachments/import";
import { htmlToMarkdown } from "./html";

export type ImportSourceKind = "markdown" | "html" | "asset";

export type ImportSourceFile = {
  /** Bundle-relative posix path (`Export/note.md`, `Foo.textbundle/text.md`). */
  rel: string;
  kind: ImportSourceKind;
  /** Text for markdown/html sources (assets need no text — host copies bytes). */
  text?: string;
};

export type ImportPlannedNote = {
  sourceRel: string;
  targetPath: string;
  content: string;
};

export type ImportPlannedAttachment = {
  sourceRel: string;
  targetPath: string;
};

export type ImportPlan = {
  notes: ImportPlannedNote[];
  attachments: ImportPlannedAttachment[];
  /** Refs kept as-is (remote/absolute/missing) for the confirm screen. */
  unmapped: { note: string; ref: string }[];
  warnings: string[];
  skipped: { rel: string; reason: string }[];
};

export type ImportPlanOptions = {
  /** Workspace-relative dir for notes ("" = root). */
  targetDir?: string;
  attachmentLocation: AttachmentLocation;
  attachmentFolder: string;
  /** Lowercased existing workspace paths (notes + all files). */
  existingLower: Set<string>;
};

export const MAX_IMPORT_NOTES = 500;

const REMOTE_RE = /^(https?:|mailto:|data:|ftp:)/i;

function posixDir(rel: string): string {
  const i = rel.lastIndexOf("/");
  return i < 0 ? "" : rel.slice(0, i);
}

function posixBase(rel: string): string {
  const i = rel.lastIndexOf("/");
  return i < 0 ? rel : rel.slice(i + 1);
}

function posixJoin(...parts: string[]): string {
  return parts
    .join("/")
    .split("/")
    .filter((p) => p !== "" && p !== ".")
    .join("/");
}

/** Resolve a link ref against the source note's bundle dir. Null for
 * remote/absolute/anchor-only refs (kept as-is). */
function resolveBundleRef(ref: string, sourceDir: string): string | null {
  const clean = ref.split("#")[0]!.split("?")[0]!;
  if (!clean || REMOTE_RE.test(clean) || clean.startsWith("/")) return null;
  const segs = posixJoin(sourceDir, clean).split("/");
  const resolved: string[] = [];
  for (const seg of segs) {
    if (seg === "..") {
      if (resolved.length === 0) return null;
      resolved.pop();
    } else if (seg !== ".") {
      resolved.push(seg);
    }
  }
  return resolved.join("/");
}

function stemOf(filename: string): string {
  const base = posixBase(filename);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? base : base.slice(0, dot);
}

/** Textbundle signature: `Name.textbundle/text.md` → note stem `Name`. */
function noteStemFor(sourceRel: string): string {
  const dir = posixDir(sourceRel);
  const bundle = posixBase(dir);
  if (/\.textbundle$/i.test(bundle) && /^text\.md$/i.test(posixBase(sourceRel))) {
    return bundle.replace(/\.textbundle$/i, "") || "Untitled";
  }
  return stemOf(sourceRel) || "Untitled";
}

export function planImport(sources: ImportSourceFile[], opts: ImportPlanOptions): ImportPlan {
  const plan: ImportPlan = { notes: [], attachments: [], unmapped: [], warnings: [], skipped: [] };
  if (!Array.isArray(sources)) return plan;
  const targetDir = (opts.targetDir ?? "").replace(/^\/+|\/+$/g, "");

  const byRel = new Map<string, ImportSourceFile>();
  for (const source of sources) {
    if (!source || typeof source.rel !== "string") continue;
    const rel = source.rel.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
    if (!rel || rel.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) continue;
    if (!byRel.has(rel.toLowerCase())) byRel.set(rel.toLowerCase(), { ...source, rel });
  }

  const noteSources = [...byRel.values()].filter(
    (s) => s.kind === "markdown" || (s.kind === "html" && typeof s.text === "string"),
  );
  const assetRels = new Set(
    [...byRel.values()].filter((s) => s.kind === "asset").map((s) => s.rel.toLowerCase()),
  );

  if (noteSources.length > MAX_IMPORT_NOTES) {
    plan.warnings.push(
      `Only the first ${MAX_IMPORT_NOTES} of ${noteSources.length} notes import (cap).`,
    );
  }

  // First pass: target paths (per-directory collision-proofing, existing
  // workspace + within-plan names both reserved).
  const takenLower = new Set(opts.existingLower);
  const targetBySource = new Map<string, string>();
  for (const source of noteSources.slice(0, MAX_IMPORT_NOTES)) {
    const stem = noteStemFor(source.rel);
    const dir = targetDir;
    const siblingLower = new Set(
      [...takenLower].filter((p) => posixDir(p) === dir).map((p) => posixBase(p).toLowerCase()),
    );
    for (const note of plan.notes) {
      if (posixDir(note.targetPath) === dir) siblingLower.add(posixBase(note.targetPath).toLowerCase());
    }
    const filename = attachmentFileName(`${stem}.md`, siblingLower);
    const target = dir ? `${dir}/${filename}` : filename;
    takenLower.add(target.toLowerCase());
    targetBySource.set(source.rel.toLowerCase(), target);
  }
  for (const source of noteSources.slice(MAX_IMPORT_NOTES)) {
    plan.skipped.push({ rel: source.rel, reason: `over the ${MAX_IMPORT_NOTES}-note cap` });
  }

  // Second pass: content conversion + link/attachment mapping.
  const attachmentTaken = new Map<string, Set<string>>();
  const claimAttachment = (dir: string, filename: string): string => {
    const key = dir.toLowerCase();
    let taken = attachmentTaken.get(key);
    if (!taken) {
      taken = new Set(
        [...opts.existingLower].filter((p) => posixDir(p) === dir).map((p) => posixBase(p).toLowerCase()),
      );
      attachmentTaken.set(key, taken);
    }
    for (const attachment of plan.attachments) {
      if (posixDir(attachment.targetPath).toLowerCase() === key) {
        taken.add(posixBase(attachment.targetPath).toLowerCase());
      }
    }
    const unique = attachmentFileName(filename, taken);
    taken.add(unique.toLowerCase());
    return dir ? `${dir}/${unique}` : unique;
  };

  for (const source of noteSources.slice(0, MAX_IMPORT_NOTES)) {
    const target = targetBySource.get(source.rel.toLowerCase())!;
    const raw = source.kind === "html" ? htmlToMarkdown(source.text ?? "") : (source.text ?? "");
    const sourceDir = posixDir(source.rel);
    const { content, mapped, handled } = rewriteRefs(raw, {
      sourceDir,
      noteTarget: target,
      targetBySource,
      assetRels,
      attachmentDirFor: (filename) => {
        const dir =
          resolveAttachmentDir(opts.attachmentLocation, opts.attachmentFolder, target) ?? "";
        return claimAttachment(dir, filename);
      },
    });
    for (const attachment of mapped) {
      if (!plan.attachments.some((a) => a.sourceRel.toLowerCase() === attachment.sourceRel.toLowerCase())) {
        plan.attachments.push(attachment);
      }
    }
    for (const ref of collectLinkRefs(raw)) {
      if (!handled.has(ref)) plan.unmapped.push({ note: target, ref });
    }
    plan.notes.push({ sourceRel: source.rel, targetPath: target, content });
  }

  // Attachments referenced but missing from the bundle stay as-is (already
  // recorded in `unmapped`); asset files nobody references are not copied.
  return plan;
}

type RewriteCtx = {
  sourceDir: string;
  noteTarget: string;
  targetBySource: Map<string, string>;
  assetRels: Set<string>;
  attachmentDirFor: (filename: string) => string;
};

const LINK_RE = /(!?)\[([^\]]*)\]\(([^)]+)\)/g;

/** Raw link destinations in original content (deduped, trimmed). */
function collectLinkRefs(content: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  LINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LINK_RE.exec(content)) !== null) {
    const raw = match[3]!.trim();
    if (!seen.has(raw)) {
      seen.add(raw);
      out.push(raw);
    }
  }
  return out;
}

function rewriteRefs(
  content: string,
  ctx: RewriteCtx,
): { content: string; mapped: ImportPlannedAttachment[]; handled: Set<string> } {
  const mapped: ImportPlannedAttachment[] = [];
  const handled = new Set<string>();
  const seen = new Map<string, string>();
  LINK_RE.lastIndex = 0;
  const next = content.replace(LINK_RE, (whole, bang: string, label: string, ref: string) => {
    const trimmed = ref.trim();
    const resolved = resolveBundleRef(trimmed, ctx.sourceDir);
    if (!resolved) return whole;
    const lower = resolved.toLowerCase();
    // Imported note → rewrite to its target path.
    const noteTarget = ctx.targetBySource.get(lower);
    if (noteTarget) {
      handled.add(trimmed);
      return `${bang}[${label}](${noteTarget})`;
    }
    // Bundled asset → copy under the attachment policy, rewrite once.
    if (ctx.assetRels.has(lower)) {
      let target = seen.get(lower);
      if (!target) {
        target = ctx.attachmentDirFor(posixBase(resolved));
        seen.set(lower, target);
        mapped.push({ sourceRel: resolved, targetPath: target });
      }
      handled.add(trimmed);
      return `${bang}[${label}](${target})`;
    }
    return whole;
  });
  return { content: next, mapped, handled };
}
