/**
 * Lossless note model for the page editor.
 *
 * A note is split into blocks that each keep their original text (`raw`).
 * `serializeNote` emits `raw` for every block that was not edited, so opening
 * and saving a note without edits is byte-for-byte identical, for any input.
 * Blocks the editor cannot edit (tables, highlighted notes `> [!info]`,
 * images, `%% comments %%`, details) are `opaque` and always kept verbatim.
 * Only blocks marked `dirty` are regenerated from their fields.
 */

export type ListItem = { indent: string; marker: string; checked?: boolean; text: string };

export type Block =
  | { type: "frontmatter"; raw: string }
  | { type: "blank"; raw: string }
  | { type: "heading"; raw: string; level: number; text: string; dirty?: boolean }
  | { type: "paragraph"; raw: string; text: string; dirty?: boolean }
  | { type: "list"; raw: string; items: ListItem[]; dirty?: boolean }
  | { type: "quote"; raw: string; text: string; dirty?: boolean }
  | { type: "code"; raw: string; lang: string; text: string; dirty?: boolean }
  | { type: "divider"; raw: string }
  | { type: "opaque"; raw: string; kind: "table" | "callout" | "image" | "comment" };

export type NoteDoc = { blocks: Block[]; eol: "\n" | "\r\n" };

const MAX_FRONTMATTER_LINES = 500;

function splitLines(source: string): string[] {
  // Keep terminators so every slice is exact.
  return source.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

const stripEol = (l: string) => l.replace(/\r?\n$/, "");
const isBlank = (l: string) => stripEol(l).trim() === "";
const FENCE = /^(\s{0,3})(`{3,}|~{3,})(.*)$/;
const HEADING = /^(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
const DIVIDER = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const LIST = /^([ \t]*)([-*+]|\d{1,9}[.)])[ \t]+(?:\[([ xX])\][ \t]+)?(.*)$/;
const TABLE_DELIM = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const IMAGE = /^\s*(!\[[^\]]*\]\([^)]*\)|!\[\[[^\]]*\]\])\s*$/;

function startsBlock(line: string, next: string | undefined): boolean {
  const t = stripEol(line);
  return (
    HEADING.test(t) || FENCE.test(t) || DIVIDER.test(t) || LIST.test(t) || /^\s{0,3}>/.test(t) ||
    /^\s*%%/.test(t) || IMAGE.test(t) || (t.includes("|") && next !== undefined && TABLE_DELIM.test(stripEol(next)) && t.trim() !== "")
  );
}

export function parseNote(source: string): NoteDoc {
  const lines = splitLines(source);
  const eol: "\n" | "\r\n" = source.includes("\r\n") ? "\r\n" : "\n";
  const blocks: Block[] = [];
  let i = 0;

  // Frontmatter must open on the very first line.
  if (lines.length > 0 && /^---[ \t]*\r?\n?$/.test(lines[0]!)) {
    const limit = Math.min(lines.length, MAX_FRONTMATTER_LINES);
    for (let j = 1; j < limit; j++) {
      if (/^(---|\.\.\.)[ \t]*\r?\n?$/.test(lines[j]!)) {
        blocks.push({ type: "frontmatter", raw: lines.slice(0, j + 1).join("") });
        i = j + 1;
        break;
      }
    }
  }

  while (i < lines.length) {
    const line = lines[i]!;
    const t = stripEol(line);

    if (isBlank(line)) {
      let j = i;
      while (j < lines.length && isBlank(lines[j]!)) j++;
      blocks.push({ type: "blank", raw: lines.slice(i, j).join("") });
      i = j;
      continue;
    }

    const fence = FENCE.exec(t);
    if (fence) {
      const [, , marks, info] = fence;
      let j = i + 1;
      let closed = false;
      while (j < lines.length) {
        const m = FENCE.exec(stripEol(lines[j]!));
        if (m && m[2]![0] === marks![0] && m[2]!.length >= marks!.length && m[3]!.trim() === "") { closed = true; break; }
        j++;
      }
      const end = closed ? j + 1 : lines.length;
      const body = lines.slice(i + 1, closed ? j : end).map(stripEol).join("\n");
      blocks.push({ type: "code", raw: lines.slice(i, end).join(""), lang: info!.trim(), text: body });
      i = end;
      continue;
    }

    if (/^\s*%%/.test(t)) {
      let j = i;
      const closesSameLine = /%%/.test(t.replace(/^\s*%%/, ""));
      if (!closesSameLine) {
        j = i + 1;
        while (j < lines.length && !lines[j]!.includes("%%")) j++;
      }
      const end = Math.min(j + 1, lines.length);
      blocks.push({ type: "opaque", kind: "comment", raw: lines.slice(i, end).join("") });
      i = end;
      continue;
    }

    if (/^\s{0,3}>/.test(t)) {
      let j = i;
      while (j < lines.length && /^\s{0,3}>/.test(stripEol(lines[j]!))) j++;
      const raw = lines.slice(i, j).join("");
      if (/^\s{0,3}>\s*\[!/.test(t)) blocks.push({ type: "opaque", kind: "callout", raw });
      else {
        const text = lines.slice(i, j).map((l) => stripEol(l).replace(/^\s{0,3}>[ ]?/, "")).join("\n");
        blocks.push({ type: "quote", raw, text });
      }
      i = j;
      continue;
    }

    if (t.includes("|") && lines[i + 1] !== undefined && TABLE_DELIM.test(stripEol(lines[i + 1]!))) {
      let j = i + 2;
      while (j < lines.length && !isBlank(lines[j]!) && lines[j]!.includes("|")) j++;
      blocks.push({ type: "opaque", kind: "table", raw: lines.slice(i, j).join("") });
      i = j;
      continue;
    }

    if (IMAGE.test(t)) {
      blocks.push({ type: "opaque", kind: "image", raw: line });
      i++;
      continue;
    }

    const heading = HEADING.exec(t);
    if (heading) {
      blocks.push({ type: "heading", raw: line, level: heading[1]!.length, text: heading[2]! });
      i++;
      continue;
    }

    if (DIVIDER.test(t) && !LIST.test(t)) {
      blocks.push({ type: "divider", raw: line });
      i++;
      continue;
    }

    if (LIST.test(t)) {
      let j = i;
      const items: ListItem[] = [];
      while (j < lines.length) {
        const m = LIST.exec(stripEol(lines[j]!));
        if (!m) break;
        items.push({ indent: m[1]!, marker: m[2]!, ...(m[3] === undefined ? {} : { checked: m[3] !== " " }), text: m[4]! });
        j++;
      }
      blocks.push({ type: "list", raw: lines.slice(i, j).join(""), items });
      i = j;
      continue;
    }

    let j = i + 1;
    while (j < lines.length && !isBlank(lines[j]!) && !startsBlock(lines[j]!, lines[j + 1])) j++;
    blocks.push({ type: "paragraph", raw: lines.slice(i, j).join(""), text: lines.slice(i, j).map(stripEol).join("\n") });
    i = j;
  }

  return { blocks, eol };
}

function lastEol(raw: string, fallback: string): string {
  return raw.endsWith("\r\n") ? "\r\n" : raw.endsWith("\n") ? "\n" : raw === "" ? fallback : "";
}

export function renderBlock(block: Block, eol: string): string {
  const tail = lastEol(block.raw, eol);
  switch (block.type) {
    case "heading": return `${"#".repeat(block.level)} ${block.text}${tail}`;
    case "paragraph": return block.text.split("\n").join(eol) + tail;
    case "quote": return block.text.split("\n").map((l) => `> ${l}`.trimEnd()).join(eol) + tail;
    case "code": return `\`\`\`${block.lang}${eol}${block.text === "" ? "" : block.text.split("\n").join(eol) + eol}\`\`\`${tail}`;
    case "list":
      return block.items
        .map((it) => `${it.indent}${it.marker} ${it.checked === undefined ? "" : `[${it.checked ? "x" : " "}] `}${it.text}`)
        .join(eol) + tail;
    default: return block.raw;
  }
}

/** Unedited blocks come back exactly as read; only dirty blocks are rebuilt. */
export function serializeNote(doc: NoteDoc): string {
  return doc.blocks.map((b) => ("dirty" in b && b.dirty ? renderBlock(b, doc.eol) : b.raw)).join("");
}

/** Returns a new doc with block `index` patched and marked dirty. */
export function editBlock(doc: NoteDoc, index: number, patch: Partial<Block>): NoteDoc {
  const cur = doc.blocks[index];
  if (!cur || cur.type === "frontmatter" || cur.type === "blank" || cur.type === "divider" || cur.type === "opaque") return doc;
  const next = { ...cur, ...patch, dirty: true } as Block;
  return { ...doc, blocks: doc.blocks.map((b, k) => (k === index ? next : b)) };
}
