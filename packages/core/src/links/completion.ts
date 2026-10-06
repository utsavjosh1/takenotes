import type { DocumentIndexEntry } from "../index/document";

/** `[[` autocomplete data + link formatting (Step 4).
 *
 * Pure, total, host-independent. The editor owns the popup; this module
 * owns candidates, context parsing, and insertion text. Insertion honors
 * the link-generation setting; resolution reuses the edge-table rule.
 */

export type LinkFormat = "shortest" | "relative" | "absolute";

export const LINK_FORMATS: readonly LinkFormat[] = ["shortest", "relative", "absolute"];

const NOTE_EXT = /\.(md|markdown|txt)$/i;

function stripNoteExt(path: string): string {
  return path.replace(/\.(md|markdown|txt)$/i, "");
}

function parentDir(rel: string): string {
  const i = rel.lastIndexOf("/");
  return i < 0 ? "" : rel.slice(0, i);
}

/** Posix-style relative path (core never touches `node:path`: the index
 * uses canonical `/` separators on every host). */
function relativeTo(fromDir: string, target: string): string {
  const from = fromDir ? fromDir.split("/") : [];
  const to = target.split("/");
  let common = 0;
  while (common < from.length && common < to.length && from[common] === to[common]) common++;
  const up = from.length - common;
  return [...Array<string>(up).fill(".."), ...to.slice(common)].join("/");
}

/** Insertion text for a link to `targetPath` from the note at `fromPath`. */
export function formatWikilink(targetPath: string, fromPath: string, format: LinkFormat): string {
  const bare = stripNoteExt(targetPath);
  switch (format) {
    case "absolute":
      return bare;
    case "relative": {
      const rel = relativeTo(parentDir(fromPath), bare);
      return rel || stripNoteExt(targetPath.split("/").pop()!);
    }
    case "shortest":
      return stripNoteExt(targetPath.split("/").pop()!);
  }
}

export type WikilinkCandidate = {
  /** Indexed note path. */
  path: string;
  /** Basename without extension (completion label). */
  name: string;
  /** Folder path for disambiguation ("" for root). Shown under duplicates. */
  sub: string;
  title?: string;
};

/** File candidates from index entries: notes only, sorted by path. */
export function fileCandidates(entries: DocumentIndexEntry[]): WikilinkCandidate[] {
  return entries
    .filter((e) => NOTE_EXT.test(e.relativePath))
    .map((e) => {
      const p = e.relativePath;
      const base = p.slice(p.lastIndexOf("/") + 1);
      return {
        path: p,
        name: stripNoteExt(base),
        sub: parentDir(p),
        ...(e.title === undefined ? {} : { title: e.title }),
      };
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export type HeadingCandidate = {
  text: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
};

/** Heading candidates for `[[path#…]]` completion (ATX index order). */
export function headingCandidates(entry: DocumentIndexEntry): HeadingCandidate[] {
  return entry.headings.map((h) => ({ text: h.text, level: h.level }));
}

export type WikilinkContext =
  | { kind: "file"; start: number; frag: string; embed: boolean }
  | { kind: "heading"; start: number; fileFrag: string; headFrag: string; embed: boolean };

/** Parse an open `[[…]]` before the cursor (`before` = line text up to the
 * cursor; `start` offsets are relative to `before`). Returns null outside a
 * completable context — notably inside an alias (`[[t|…`), where typing
 * continues the label, not the target. Embeds (`![[`) complete files too. */
export function parseWikilinkContext(before: string): WikilinkContext | null {
  // `|` is excluded from every fragment class, so an alias (`[[t|…`)
  // can never match — typing there continues the label, not the target.
  const m = /(!?)\[\[([^\]\n#|]*)(?:#([^\]\n|]*))?$/.exec(before);
  if (!m) return null;
  const start = before.length - m[0].length;
  const embed = m[1] === "!";
  if (m[3] === undefined) return { kind: "file", start, frag: m[2]!, embed };
  return { kind: "heading", start, fileFrag: m[2]!, headFrag: m[3]!, embed };
}
