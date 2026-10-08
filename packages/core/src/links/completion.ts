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

/** Link path to `targetPath` from the note at `fromPath`, in the active
 * format. Markdown links keep the note extension (`Note.md` — the file
 * must resolve on disk); wikilinks strip it (`Note`). */
function linkPath(targetPath: string, fromPath: string, format: LinkFormat, keepExt: boolean): string {
  const bare = keepExt ? targetPath : stripNoteExt(targetPath);
  const base = keepExt ? targetPath.split("/").pop()! : stripNoteExt(targetPath.split("/").pop()!);
  switch (format) {
    case "absolute":
      return bare;
    case "relative": {
      const rel = relativeTo(parentDir(fromPath), bare);
      return rel || base;
    }
    case "shortest":
      return base;
  }
}

/** Insertion text for a link to `targetPath` from the note at `fromPath`. */
export function formatWikilink(targetPath: string, fromPath: string, format: LinkFormat): string {
  return linkPath(targetPath, fromPath, format, false);
}

/** Markdown-link insertion text for a file link: `[label](url)`. The url
 * keeps the extension in the active link format, URI-encoded (`My
 * Note.md` → `My%20Note.md`); `#` encodes too so `A#B.md` never parses
 * as a fragment. Aliases become the label (`[NB](Note.md)`). */
export function formatMarkdownLink(targetPath: string, label: string, fromPath: string, format: LinkFormat): string {
  const url = encodeURI(linkPath(targetPath, fromPath, format, true)).replace(/#/g, "%23");
  return `[${label}](${url})`;
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

export type BlockCandidate = {
  /** Block id without the `^` (`blk` completes `[[file#^blk]]`). */
  id: string;
  /** 1-based source line, shown as disambiguation. */
  line: number;
};

/** Block candidates for `[[path#^…]]` completion (source order): general
 * trailing-`^id` lines plus task anchors (the index never assigns IDs —
 * both sources are author-written). Merged by line for stable order. */
export function blockCandidates(entry: DocumentIndexEntry): BlockCandidate[] {
  const fromTasks = entry.tasks.flatMap((t) =>
    t.anchor === undefined ? [] : [{ id: t.anchor, line: t.line }],
  );
  return [...entry.blocks, ...fromTasks].sort((a, b) => a.line - b.line);
}

export type AliasCandidate = {
  /** Alias (or title) text the user typed. */
  alias: string;
  /** Indexed note path it points at. */
  path: string;
  /** Basename without extension (completion label fallback). */
  name: string;
  /** Folder path for disambiguation ("" for root). */
  sub: string;
};

/** Alias candidates for `[[alias…]]` completion: every entry's frontmatter
 * aliases plus its title when distinct from the basename. Sorted by alias,
 * then path, so duplicates disambiguate the same way files do. */
export function aliasCandidates(entries: DocumentIndexEntry[]): AliasCandidate[] {
  const out: AliasCandidate[] = [];
  for (const e of entries) {
    if (!NOTE_EXT.test(e.relativePath)) continue;
    const p = e.relativePath;
    const base = p.slice(p.lastIndexOf("/") + 1);
    const name = stripNoteExt(base);
    const seen = new Set<string>();
    const push = (alias: string): void => {
      const t = alias.trim();
      const folded = t.toLowerCase();
      if (!t || folded === name.toLowerCase() || seen.has(folded)) return;
      seen.add(folded);
      out.push({ alias: t, path: p, name, sub: parentDir(p) });
    };
    if (e.title !== undefined) push(e.title);
    for (const a of e.aliases) push(a);
  }
  out.sort((a, b) =>
    a.alias.toLowerCase() < b.alias.toLowerCase()
      ? -1
      : a.alias.toLowerCase() > b.alias.toLowerCase()
        ? 1
        : a.path < b.path
          ? -1
          : a.path > b.path
            ? 1
            : 0,
  );
  return out;
}

/** Resolve the creation path for following a link to a nonexistent note
 * (Step 4 follow-to-create). Returns the workspace-relative note path to
 * create, or null when the target cannot become a safe path.
 *
 * Rules (mirroring resolution so created notes resolve back): `#fragment`
 * never affects the path — the file opens, scroll-to-anchor is deferred;
 * an explicit note extension is honored, otherwise `.md` is appended;
 * non-note extensions refuse (attachments arrive with Step 4 attachments,
 * never as `pic.png.md`); path-qualified targets resolve from the
 * workspace root (parents created on demand); bare names land beside the
 * linking note so relative links keep working. Absolute paths, `..`
 * escapes, NUL bytes, and empty targets refuse — creation never escapes
 * the workspace root. Host-independent: `/` separators, no `node:path`. */
export function resolveCreationPath(rawTarget: string, fromPath: string): string | null {
  const noFrag = (rawTarget.split("#")[0] ?? "").trim().replace(/\\/g, "/");
  if (!noFrag || noFrag.includes("\0")) return null;
  // Absolute or root-escaping targets refuse before segment checks.
  if (noFrag.startsWith("/")) return null;
  const segs = noFrag.split("/").filter((s) => s !== "" && s !== ".");
  if (segs.length === 0 || segs.some((s) => s === "..")) return null;
  const last = segs[segs.length - 1]!;
  // A present-but-foreign extension (`.png`, no extension at all is fine)
  // refuses: attachment creation is a separate flow with its own policy.
  if (/\.[A-Za-z0-9]+$/.test(last) && !NOTE_EXT.test(last)) return null;
  const file = NOTE_EXT.test(last) ? last : `${last}.md`;
  const rel = segs.length === 1 ? [...parentDir(fromPath).split("/").filter(Boolean), file] : [...segs.slice(0, -1), file];
  return rel.join("/");
}

export type WikilinkContext =
  | { kind: "file"; start: number; frag: string; embed: boolean }
  | { kind: "heading"; start: number; fileFrag: string; headFrag: string; embed: boolean }
  | { kind: "block"; start: number; fileFrag: string; blockFrag: string; embed: boolean };

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
  // `#^frag` completes block ids; `#frag` completes headings. The caret is
  // syntactic, so an empty `#^` still opens the block list, not headings.
  if (m[3]!.startsWith("^")) return { kind: "block", start, fileFrag: m[2]!, blockFrag: m[3]!.slice(1), embed };
  return { kind: "heading", start, fileFrag: m[2]!, headFrag: m[3]!, embed };
}
