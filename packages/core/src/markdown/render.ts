import { parseEmbedFragment, parseEmbedSize } from "../links/embed-params";

export type RenderedMarkdown = {
  html: string;
  /** Footnote ids encountered in body order (explicit [^id] + synthetic inline-N for ^[text]). */
  footnotes: string[];
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function safeHref(raw: string): string {
  const value = raw.trim().replace(/^<(.+)>$/, "$1").trim();
  if (!value) return "#";
  if (/^(javascript|vbscript|data):/i.test(value)) return "#";
  return value;
}

function slug(text: string): string {
  const s = text.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
  return s || "section";
}

type FootnoteCtx = {
  order: string[];
  /** Synthetic inline-N id -> raw (unescaped) footnote text. */
  inline: Map<string, string>;
  n: number;
  /** Reference link/image definitions `[label]: href "title"` (lowercased label). */
  linkDefs: Map<string, { href: string; title: string }>;
};

function newFootnoteCtx(linkDefs = new Map<string, { href: string; title: string }>()): FootnoteCtx {
  return { order: [], inline: new Map(), n: 0, linkDefs };
}

const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|flac|aac|opus)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|mkv|ogv|m4v)$/i;
const PDF_EXT = /\.pdf$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

/** Attachment kind by file extension (query/fragment ignored). Step 1
 * reading view renders local audio/video/PDF beyond plain `<img>`. */
function mediaKind(href: string): "audio" | "video" | "pdf" | null {
  const base = href.split(/[?#]/)[0] ?? "";
  if (AUDIO_EXT.test(base)) return "audio";
  if (VIDEO_EXT.test(base)) return "video";
  if (PDF_EXT.test(base)) return "pdf";
  return null;
}

/** Inline media tag for `![label](href)` (null when not an attachment). */
function mediaTag(safe: string, label: string): string | null {
  if (safe === "#") return null;
  const kind = mediaKind(safe);
  const src = escapeAttr(safe);
  const text = escapeHtml(label);
  if (kind === "audio") return `<audio controls src="${src}">${text}</audio>`;
  if (kind === "video") return `<video controls preload="metadata" src="${src}">${text}</video>`;
  if (kind === "pdf") return `<embed src="${src}" type="application/pdf">`;
  return null;
}

/** Titles arrive entity-escaped (the inline pass escapes first); decode the
 * five named escapes before re-escaping for the attribute. */
function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

const KNOWN_CALLOUTS = new Set([
  "note", "abstract", "summary", "tldr", "info", "todo", "tip", "hint", "important",
  "success", "check", "done", "question", "help", "faq", "warning", "caution",
  "attention", "failure", "fail", "missing", "danger", "error", "bug", "example",
  "quote", "cite",
]);

function renderInline(input: string, ctx: FootnoteCtx): string {
  // Code spans are stashed first behind NUL-delimited tokens so that
  // %%-stripping, footnotes, links, and emphasis never touch their raw
  // text (old @@-style tokens contained underscores that emphasis ate,
  // leaking placeholder garbage into reading view). The stash is local so
  // nested rendering (callouts, footnotes, table cells) cannot clobber it.
  const codeStash: string[] = [];
  let s = input.replace(/`([^`]+)`/g, (_m, code: string) => {
    const token = `\u0000CODE${codeStash.length}\u0000`;
    codeStash.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });
  // Strip %%comments%% (multiline-capable). Comments never render.
  s = s.replace(/%%[\s\S]*?%%/g, "");
  // Inline footnotes ^[text]: capture raw before escaping so the footnote
  // body can be rendered as markdown later without double-escaping.
  s = s.replace(/\^\[([^\]]+)\]/g, (_m, raw: string) => {
    ctx.n += 1;
    const id = `inline-${ctx.n}`;
    // Order is established later in source order by the combined
    // footnote-ref pass; here we only stash the body text.
    ctx.inline.set(id, raw);
    return `\u0000FN${id}\u0000`;
  });
  s = escapeHtml(s);

  // Images: ![alt](href "title") + ![alt](<href with spaces>) — local
  // relative paths pass through; hostile schemes are neutralized.
  // Audio/video/PDF attachments render as media tags, not <img>.
  s = s.replace(/!\[([^\]]*)\]\(\s*(?:<([^>]+)>|&lt;([^&]+)&gt;)\s*\)/g, (_m, alt: string, h1: string, h2: string) => {
    const safe = safeHref(h1 ?? h2 ?? "");
    return mediaTag(safe, alt) ?? `<img src="${escapeAttr(safe)}" alt="${escapeAttr(alt)}" loading="lazy">`;
  });
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_m, alt: string, href: string, title: string | undefined) => {
    const safe = safeHref(href);
    const titleAttr = title ? ` title="${escapeAttr(decodeEntities(title))}"` : "";
    return mediaTag(safe, alt) ?? `<img src="${escapeAttr(safe)}" alt="${escapeAttr(alt)}"${titleAttr} loading="lazy">`;
  });
  // Image references: ![alt][label] / ![alt][] (empty = alt text).
  s = s.replace(/!\[([^\]]+)\]\[([^\]]*)\]/g, (_m, alt: string, label: string) => {
    const def = ctx.linkDefs.get((label || alt).toLowerCase());
    if (!def) return _m;
    const safe = safeHref(def.href);
    const titleAttr = def.title ? ` title="${escapeAttr(def.title)}"` : "";
    return mediaTag(safe, alt) ?? `<img src="${escapeAttr(safe)}" alt="${escapeAttr(alt)}"${titleAttr} loading="lazy">`;
  });
  s = s.replace(/\[([^\]]+)\]\(\s*(?:<([^>]+)>|&lt;([^&]+)&gt;)\s*\)/g, (_m, text: string, h1: string, h2: string) => {
    const safe = safeHref(h1 ?? h2 ?? "");
    return `<a href="${escapeAttr(safe)}" rel="noreferrer noopener">${text}</a>`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_m, text: string, href: string, title: string | undefined) => {
    const safe = safeHref(href);
    const titleAttr = title ? ` title="${escapeAttr(decodeEntities(title))}"` : "";
    return `<a href="${escapeAttr(safe)}"${titleAttr} rel="noreferrer noopener">${text}</a>`;
  });
  // Reference links: [text][label] / [text][] (empty = text). Footnote
  // definitions ([^id]:) never land in linkDefs, so no clash.
  s = s.replace(/\[([^\]]+)\]\[([^\]]*)\]/g, (_m, text: string, label: string) => {
    const def = ctx.linkDefs.get((label || text).toLowerCase());
    if (!def) return _m;
    const titleAttr = def.title ? ` title="${escapeAttr(def.title)}"` : "";
    return `<a href="${escapeAttr(safeHref(def.href))}"${titleAttr} rel="noreferrer noopener">${text}</a>`;
  });
  // Shortcut reference links [label] — never images, wikilinks, or
  // footnotes; only links when a definition exists. (The trailing
  // negative lookahead plus backtracking already excludes `[[…]]`: any
  // candidate spanning the double bracket fails and returns unchanged.)
  s = s.replace(/(?<!!)\[(?!\])((?:[^[\]\n]|\\.)+)\](?!\[|\(|\])/g, (_m, text: string) => {
    const def = ctx.linkDefs.get(text.toLowerCase());
    if (!def) return _m;
    const titleAttr = def.title ? ` title="${escapeAttr(def.title)}"` : "";
    return `<a href="${escapeAttr(safeHref(def.href))}"${titleAttr} rel="noreferrer noopener">${text}</a>`;
  });
  s = s.replace(/(!?)\[\[([^\]\n]+)\]\]/g, (_m, embed: string, inner: string) => {
    const parts = inner.split("|");
    const target = parts[0]!.trim();
    const aliasRaw = parts[1]?.trim() || undefined;
    const label = (aliasRaw ?? target).trim();
    if (embed) {
      // Attachment embeds render inline media; note embeds stay anchors
      // the app resolves via data-wikilink.
      const kind = mediaKind(target);
      const data = `class="md-embed-link" data-wikilink="${escapeAttr(target)}"`;
      if (kind === "audio") return `<audio controls src="${escapeAttr(target)}" ${data}>${escapeHtml(label)}</audio>`;
      if (kind === "video") return `<video controls preload="metadata" src="${escapeAttr(target)}" ${data}>${escapeHtml(label)}</video>`;
      if (kind === "pdf") {
        // `#page=N` already rides along in src for the viewer; `#height=`
        // becomes the element height. Other fragments keep legacy output.
        // `decodeEntities`: inline text arrives entity-escaped, so `&` in
        // combined params decodes before the single attribute escape.
        const raw = decodeEntities(target);
        const frag = raw.split("#").slice(1).join("#");
        const height = parseEmbedFragment(frag || undefined)?.height;
        const heightAttr = height === undefined ? "" : ` height="${height}"`;
        const pdfData = `class="md-embed-link" data-wikilink="${escapeAttr(raw)}"`;
        return `<embed src="${escapeAttr(raw)}" type="application/pdf"${heightAttr} ${pdfData}>`;
      }
      // Sized image embeds (`![[pic.png|100x145]]`) render `<img>` with
      // width/height; unsized image embeds keep the legacy anchor below.
      // (Audio/video ignore dims; note embeds keep numeric aliases.)
      const size = parseEmbedSize(aliasRaw);
      if (size && IMAGE_EXT.test(target.split(/[?#]/)[0] ?? "")) {
        const raw = decodeEntities(target);
        const dims =
          (size.width === undefined ? "" : ` width="${size.width}"`) +
          (size.height === undefined ? "" : ` height="${size.height}"`);
        const imgData = `class="md-embed-link" data-wikilink="${escapeAttr(raw)}"`;
        return `<img src="${escapeAttr(raw)}" alt="${escapeAttr(raw)}"${dims} loading="lazy" ${imgData}>`;
      }
    }
    const cls = embed ? "md-embed-link" : "md-wikilink";
    return `<a href="#" class="${cls}" data-wikilink="${escapeAttr(target)}">${escapeHtml(label)}</a>`;
  });
  // Autolinks <https://…> / <user@example>: whatever survived the
  // explicit-link rules above in &lt;&gt; form is linkified here.
  s = s.replace(/&lt;((?:https?|ftp):[^&\s<>]+)&gt;/g, (_m, href: string) => {
    return `<a href="${escapeAttr(safeHref(href))}" rel="noreferrer noopener">${escapeHtml(href)}</a>`;
  });
  s = s.replace(/&lt;([\w.%+-]+@[\w-]+(?:\.[\w-]+)+)&gt;/g, (_m, addr: string) => {
    return `<a href="mailto:${escapeAttr(addr)}" rel="noreferrer noopener">${escapeHtml(addr)}</a>`;
  });
  // Footnote refs in source order: explicit [^id] and inline ^[text]
  // share one pass so ctx.order matches body order.
  s = s.replace(/\[\^([^\]]+)\]|\0FN(inline-\d+)\0/g, (_m, id: string | undefined, inlineId: string | undefined) => {
    const fid = (id ?? inlineId)!;
    if (!ctx.order.includes(fid)) ctx.order.push(fid);
    const label = fid.startsWith("inline-") ? fid.replace(/^inline-/, "") : fid;
    return `<sup id="fnref-${escapeAttr(fid)}"><a href="#fn-${escapeAttr(fid)}">${escapeHtml(label)}</a></sup>`;
  });
  // Restore inline-footnote placeholders as <sup> links (legacy path; the
  // combined pass above already handles them when present).
  s = s.replace(/\0FN(inline-\d+)\0/g, (_m, id: string) => {
    return `<sup id="fnref-${escapeAttr(id)}"><a href="#fn-${escapeAttr(id)}">${escapeHtml(id.replace(/^inline-/, ""))}</a></sup>`;
  });
  s = s.replace(/~~(.+?)~~/g, "<del>$1</del>");
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__(.+?)__/g, "<strong>$1</strong>");
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
  s = s.replace(/(?<!_)_([^_\n]+)_(?!_)/g, "<em>$1</em>");
  // Restore code spans last; NUL tokens survive every pass above.
  s = s.replace(/\0CODE(\d+)\0/g, (_m, n: string) => codeStash[Number(n)] ?? "");
  return s;
}

/** Render footnote body markdown without polluting the main footnote order. */
function renderFootnoteBody(raw: string, linkDefs: FootnoteCtx["linkDefs"]): string {
  return renderInline(raw, newFootnoteCtx(linkDefs));
}

/** Thematic break: `***`, `---`, `___` (spaces allowed). A lone `---`
 * directly after paragraph text is a setext H2 underline, not a break —
 * the paragraph branch checks that first. */
function isThematicBreak(line: string): boolean {
  return /^\s{0,3}(?:(?:\* *){3,}|(?:_ *){3,}|(?:- *){3,})\s*$/.test(line);
}

/** Setext underline level: `===` → 1, `---` → 2, else 0. */
function setextLevel(line: string): 1 | 2 | 0 {
  const m = /^\s*(=+|-+)\s*$/.exec(line);
  if (!m) return 0;
  return m[1]![0] === "=" ? 1 : 2;
}

function isBlank(line: string): boolean {
  return line.trim().length === 0;
}

function isFence(line: string): RegExpExecArray | null {
  return /^\s*(```+|~~~+)\s*([^`]*)$/.exec(line);
}

/** CommonMark HTML block start (subset): prevents markdown rendering inside. */
function isHtmlBlockStart(line: string): boolean {
  if (/^\s*<!--/.test(line)) return true;
  if (/^\s*<\?(?:[^?]|\?(?!>))*>\s*$/.test(line)) return true;
  return /^\s*<(address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|section|source|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?=[\s>/]|$)/i.test(line);
}

function tableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);
}

function tableAlignments(sepLine: string, count: number): ("left" | "center" | "right" | null)[] {
  const cells = splitTableRow(sepLine);
  const out: ("left" | "center" | "right" | null)[] = [];
  for (let i = 0; i < count; i++) {
    const c = (cells[i] ?? "").trim();
    if (/^:.*:$/.test(c)) out.push("center");
    else if (/^:/.test(c)) out.push("left");
    else if (/:$/.test(c)) out.push("right");
    else out.push(null);
  }
  return out;
}

function splitTableRow(line: string): string[] {
  const PLACEHOLDER_BS = "\u0000BS\u0000";
  const PLACEHOLDER_PIPE = "\u0000PIPE\u0000";
  let t = line.trim();
  // Work on escaped sequences first so `\|` never splits.
  t = t.replace(/\\\\/g, PLACEHOLDER_BS).replace(/\\\|/g, PLACEHOLDER_PIPE);
  t = t.replace(/^\|/, "").replace(/\|$/, "");
  return t.split("|").map((c) =>
    c.replace(new RegExp(PLACEHOLDER_PIPE, "g"), "|").replace(new RegExp(PLACEHOLDER_BS, "g"), "\\").trim(),
  );
}

type ListItem = {
  indent: number;
  ordered: boolean;
  text: string;
  checked: boolean | null;
  lineNo: number;
  children: ListItem[];
};

function renderListItems(items: ListItem[], ctx: FootnoteCtx): string {
  if (items.length === 0) return "";
  let html = "";
  let i = 0;
  while (i < items.length) {
    const ordered = items[i]!.ordered;
    const tag = ordered ? "ol" : "ul";
    let group = "";
    while (i < items.length && items[i]!.ordered === ordered) {
      const item = items[i]!;
      const body = item.checked !== null
        ? `<li data-line="${item.lineNo}" class="md-task"><input type="checkbox" data-line="${item.lineNo}"${item.checked ? " checked" : ""} aria-label="Toggle task"> <span>${renderInline(item.text, ctx)}</span>${renderListItems(item.children, ctx)}</li>`
        : `<li data-line="${item.lineNo}">${renderInline(item.text, ctx)}${renderListItems(item.children, ctx)}</li>`;
      group += body;
      i += 1;
    }
    html += `<${tag}>${group}</${tag}>`;
  }
  return html;
}

function renderBlocks(lines: string[], startLine: number, ctx: FootnoteCtx): string {
  const out: string[] = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i]!;
    const lineNo = startLine + i;
    if (isBlank(line)) { i += 1; continue; }

    const fence = isFence(line);
    if (fence) {
      const marker = fence[1]!;
      const lang = fence[2]!.trim().split(/\s+/)[0] ?? "";
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i]!.trim().startsWith(marker)) {
        code.push(lines[i]!);
        i += 1;
      }
      if (i < lines.length) i += 1;
      out.push(`<pre data-line="${lineNo}"><code${lang ? ` class="language-${escapeAttr(lang)}"` : ""}>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    // HTML blocks: escape as-is through the next blank line; no markdown
    // inside (sanitized HTML — no script, no inner render).
    if (isHtmlBlockStart(line)) {
      const raw: string[] = [line];
      i += 1;
      while (i < lines.length && !isBlank(lines[i]!)) {
        raw.push(lines[i]!);
        i += 1;
      }
      out.push(`<p data-line="${lineNo}">${escapeHtml(raw.join("\n")).replace(/\n/g, "<br>")}</p>`);
      continue;
    }

    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      const text = renderInline(heading[2]!, ctx);
      out.push(`<h${level} data-line="${lineNo}" id="${escapeAttr(slug(heading[2]!))}">${text}</h${level}>`);
      i += 1;
      continue;
    }

    if (line.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i]!.startsWith(">")) {
        quote.push(lines[i]!.replace(/^> ?/, ""));
        i += 1;
      }
      const callout = /^\[!([A-Za-z0-9_-]+)\]([+-])?\s*(.*)$/.exec(quote[0] ?? "");
      if (callout) {
        const rawType = callout[1]!;
        const folded = callout[2] ?? "";
        const kind = KNOWN_CALLOUTS.has(rawType.toLowerCase()) ? rawType.toLowerCase() : "note";
        const title = callout[3]?.trim() || kind;
        const body = quote.slice(1);
        const bodyHtml = renderBlocks(body, lineNo + 1, ctx);
        const cls = `md-callout md-callout-${escapeAttr(kind)}`;
        const dataAttr = ` data-callout="${escapeAttr(rawType.toLowerCase())}"`;
        const titleHtml = renderInline(title, ctx);
        if (folded === "+") {
          out.push(`<aside data-line="${lineNo}" class="${cls}"${dataAttr}><details open><summary class="md-callout-title">${titleHtml}</summary><div class="md-callout-body">${bodyHtml}</div></details></aside>`);
        } else if (folded === "-") {
          out.push(`<aside data-line="${lineNo}" class="${cls}"${dataAttr}><details><summary class="md-callout-title">${titleHtml}</summary><div class="md-callout-body">${bodyHtml}</div></details></aside>`);
        } else {
          out.push(`<aside data-line="${lineNo}" class="${cls}"${dataAttr}><div class="md-callout-title">${titleHtml}</div><div class="md-callout-body">${bodyHtml}</div></aside>`);
        }
      } else {
        out.push(`<blockquote data-line="${lineNo}">${renderBlocks(quote, lineNo, ctx)}</blockquote>`);
      }
      continue;
    }

    if (i + 1 < lines.length && line.includes("|") && tableSeparator(lines[i + 1]!)) {
      const headers = splitTableRow(line);
      const aligns = tableAlignments(lines[i + 1]!, headers.length);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.includes("|") && !isBlank(lines[i]!)) {
        rows.push(splitTableRow(lines[i]!));
        i += 1;
      }
      const alignAttr = (a: "left" | "center" | "right" | null): string => (a ? ` align="${a}"` : "");
      out.push(`<table data-line="${lineNo}"><thead><tr>${headers.map((h, ix) => `<th${alignAttr(aligns[ix] ?? null)}>${renderInline(h, ctx)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${headers.map((_h, ix) => `<td${alignAttr(aligns[ix] ?? null)}>${renderInline(r[ix] ?? "", ctx)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }

    const list = /^(\s*)([-*+] |\d+[.)] )(.*)$/.exec(line);
    if (list) {
      // Collect one contiguous list run, then nest by indentation.
      const rawItems: ListItem[] = [];
      while (i < lines.length) {
        const m = /^(\s*)([-*+] |\d+[.)] )(.*)$/.exec(lines[i]!);
        if (!m) break;
        const indent = m[1]!.replace(/\t/g, "    ").length;
        const ordered = /\d/.test(m[2]!);
        const task = /^\[([^\]])\]\s+(.*)$/.exec(m[3]!);
        if (task) {
          // Any non-space marker = done (Step 1 tasks).
          rawItems.push({ indent, ordered, text: task[2]!, checked: task[1] !== " ", lineNo: startLine + i, children: [] });
        } else {
          rawItems.push({ indent, ordered, text: m[3]!, checked: null, lineNo: startLine + i, children: [] });
        }
        i += 1;
      }
      // Nest by indentation: deeper indent => child of previous item.
      const rebuilt: ListItem[] = [];
      const ancestors: ListItem[] = [];
      const clean: ListItem[] = rawItems.map((r) => ({ ...r, children: [] }));
      for (const node of clean) {
        while (ancestors.length > 0 && node.indent <= ancestors[ancestors.length - 1]!.indent) ancestors.pop();
        if (ancestors.length === 0) rebuilt.push(node);
        else ancestors[ancestors.length - 1]!.children.push(node);
        ancestors.push(node);
      }
      out.push(renderListItems(rebuilt, ctx));
      continue;
    }

    // Thematic break (CommonMark: interrupts paragraphs; `---` directly
    // after paragraph text is handled as setext by the paragraph branch).
    if (isThematicBreak(line)) {
      out.push(`<hr data-line="${lineNo}">`);
      i += 1;
      continue;
    }

    // Indented code: 4 spaces or a tab. Never interrupts a paragraph —
    // indented lines there are lazy continuations swallowed above — so
    // this only triggers after blank lines or other blocks.
    if (/^(?: {4}|\t)/.test(line)) {
      const code: string[] = [];
      const firstLine = lineNo;
      while (i < lines.length && /^(?: {4}|\t)/.test(lines[i]!) && !isBlank(lines[i]!)) {
        code.push(lines[i]!.replace(/^ {4}/, "").replace(/^\t/, "    "));
        i += 1;
      }
      out.push(`<pre data-line="${firstLine}"><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    const para: string[] = [line];
    i += 1;
    while (i < lines.length && !isBlank(lines[i]!) && !isFence(lines[i]!) && !/^(#{1,6})\s+/.test(lines[i]!) && !lines[i]!.startsWith(">") && !/^(\s*)([-*+] |\d+[.)] )/.test(lines[i]!) && !isHtmlBlockStart(lines[i]!) && !isThematicBreak(lines[i]!) && setextLevel(lines[i]!) === 0) {
      if (i + 1 < lines.length && lines[i]!.includes("|") && tableSeparator(lines[i + 1]!)) break;
      para.push(lines[i]!);
      i += 1;
    }
    // Setext headings: underline directly after paragraph text.
    const underline = i < lines.length ? setextLevel(lines[i]!) : 0;
    if (underline > 0) {
      i += 1;
      const text = renderInline(para.join("\n"), ctx).replace(/\n/g, "<br>");
      out.push(`<h${underline} data-line="${lineNo}" id="${escapeAttr(slug(para.join(" ")))}">${text}</h${underline}>`);
      continue;
    }
    out.push(`<p data-line="${lineNo}">${renderInline(para.join("\n"), ctx).replace(/\n/g, "<br>")}</p>`);
  }
  return out.join("\n");
}

export function renderMarkdown(content: string): RenderedMarkdown {
  const linkDefs = new Map<string, { href: string; title: string }>();
  const ctx = newFootnoteCtx(linkDefs);
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const footnoteDefs = new Map<string, string>();
  const body: string[] = [];
  for (const line of lines) {
    const def = /^\[\^([^\]]+)\]:\s*(.*)$/.exec(line);
    if (def) {
      footnoteDefs.set(def[1]!, def[2] ?? "");
      // Preserve source line numbers for task checkbox mutations.
      body.push("");
      continue;
    }
    // Reference definitions `[label]: href "title"` (CommonMark: up to
    // 3 leading spaces, first definition wins, `[^x]:` footnote defs
    // excluded). Removed from the body with line numbers preserved.
    const link = /^\s{0,3}\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))(?:\s+("[^"]*"|'[^']*'|\([^)]*\)))?\s*$/.exec(line);
    if (link && !link[1]!.startsWith("^")) {
      const label = link[1]!.toLowerCase();
      const href = link[2] ?? link[3] ?? "";
      const rawTitle = link[4] ?? "";
      const title = rawTitle.replace(/^["'(]/, "").replace(/["')]?$/, "");
      if (href && !linkDefs.has(label)) linkDefs.set(label, { href, title });
      body.push("");
      continue;
    }
    body.push(line);
  }
  let html = renderBlocks(body, 1, ctx);
  const defined = ctx.order.filter((id) => footnoteDefs.has(id) || ctx.inline.has(id));
  if (defined.length > 0) {
    html += `<section class="md-footnotes"><hr><ol>${defined.map((id) => {
      const raw = ctx.inline.has(id) ? ctx.inline.get(id)! : (footnoteDefs.get(id) ?? "");
      return `<li id="fn-${escapeAttr(id)}">${renderFootnoteBody(raw, linkDefs)}</li>`;
    }).join("")}</ol></section>`;
  }
  return { html, footnotes: [...ctx.order] };
}

export function toggleTaskCheckboxAtLine(content: string, lineNumber: number): string | null {
  const normalized = content.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const index = lineNumber - 1;
  const line = lines[index];
  if (line === undefined) return null;
  const next = line.replace(/^(\s*(?:[-*+] |\d+[.)] )\[)([^\]])(\]\s+)/, (_m, before: string, mark: string, after: string) => `${before}${mark === " " ? "x" : " "}${after}`);
  if (next === line) return null;
  lines[index] = next;
  return lines.join("\n");
}
