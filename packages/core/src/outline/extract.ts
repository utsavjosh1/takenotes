/**
 * Step 2 Outline/Preview pure helpers (no index dependency).
 * Live-parse of the active note only: ATX headings, anchor lines, excerpts.
 */

export type OutlineHeading = {
  text: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  /** 1-based line number in the source. */
  line: number;
  anchor: string;
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 _-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** ATX headings (`# `–`###### `) with 1-based lines; fenced code excluded. */
export function extractAtxHeadings(content: string): OutlineHeading[] {
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const out: OutlineHeading[] = [];
  const seen = new Map<string, number>();
  let fence: { ch: string; len: number } | null = null;
  lines.forEach((raw, i) => {
    const line = raw;
    // A fence only closes on the same marker char, at least as long as the
    // opener, with nothing but whitespace after it (CommonMark: no info
    // string on closing fences; ```js never closes a ```` block).
    const fenceMatch = /^(\s{0,3})(```+|~~~+)(.*)$/.exec(line);
    if (fence === null) {
      if (fenceMatch) {
        fence = { ch: fenceMatch[2]![0]!, len: fenceMatch[2]!.length };
        return;
      }
    } else {
      if (
        fenceMatch &&
        fenceMatch[2]![0] === fence.ch &&
        fenceMatch[2]!.length >= fence.len &&
        fenceMatch[3]!.trim() === ""
      ) {
        fence = null;
      }
      return;
    }
    const m = /^(\s{0,3})(#{1,6})\s+(.+?)\s*(#+\s*)?$/.exec(line);
    if (!m) return;
    const text = m[3]!.replace(/\s+#+\s*$/, "").trim();
    if (!text) return;
    const base = slugify(text) || "section";
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.push({
      text,
      level: m[2]!.length as OutlineHeading["level"],
      line: i + 1,
      anchor: n === 0 ? base : `${base}-${n}`,
    });
  });
  return out;
}

/** 1-based line of the heading whose text/anchor matches `frag` (decoded). */
export function lineForHeadingFragment(content: string, frag: string): number | null {
  const want = (() => {
    try {
      return decodeURIComponent(frag);
    } catch {
      return frag;
    }
  })();
  const headings = extractAtxHeadings(content);
  const byAnchor = headings.find((h) => h.anchor === want.toLowerCase() || h.anchor === slugify(want));
  if (byAnchor) return byAnchor.line;
  const byText = headings.find((h) => h.text.toLowerCase() === want.toLowerCase());
  return byText ? byText.line : null;
}

/** 1-based line containing block id `^id` (with or without the caret). */
export function lineForBlockId(content: string, id: string): number | null {
  const needle = id.startsWith("^") ? id : `^${id}`;
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.includes(needle)) return i + 1;
  }
  return null;
}

/** First `maxLines` non-empty-trimmed excerpt for hover previews. */
export function previewExcerpt(text: string, maxLines = 20, maxChars = 4000): string {
  const lines = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n").slice(0, maxLines);
  const excerpt = lines.join("\n");
  return excerpt.length > maxChars ? `${excerpt.slice(0, maxChars)}\n…` : excerpt;
}
