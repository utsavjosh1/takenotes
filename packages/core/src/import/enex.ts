/** Step 8 + v2 Elephant: Evernote `.enex` import — pure + total.
 *
 * Obsidian handles Evernote via its Importer plugin (`.enex` XML → Markdown
 * + attachments with a confirm-screen report). takenotes v2 implements the
 * same outcome without the plugin: parse `.enex`, convert each `<note>` to
 * Markdown (HTML content via `htmlToMarkdown`), map `<resource>` binaries to
 * attachment sources, and feed everything through `planImport()` so naming,
 * collision-proofing, link rewrites, and the unmapped/warnings/skipped
 * report behave identically to Markdown/Textbundle/HTML imports.
 *
 * Bounds: at most MAX_IMPORT_NOTES notes (shared with planImport); each note
 * content capped at 1 MiB (over → skipped with reason); resources capped at
 * 25 MiB decoded each (over → skipped + warned). Malformed XML degrades to
 * skip + warn — never throws, never fetches remote images.
 */
import { htmlToMarkdown } from "./html";
import { planImport, type ImportPlan, type ImportPlanOptions, type ImportSourceFile } from "./plan";

export type EnexResource = {
  /** Original filename from <resource-attributes><file-name>, or derived. */
  filename: string;
  mime: string;
  /** Raw base64 payload as found in <data encoding="base64">. Host decodes + writes bytes. */
  dataB64: string;
  /** MD5 hex of the decoded bytes (matches en-media hash when present). */
  hash?: string;
};

export type EnexNote = {
  title: string;
  created?: string;
  updated?: string;
  tags: string[];
  /** Evernote content HTML (inside <content><![CDATA[ENML]]>). */
  html: string;
  resources: EnexResource[];
};

export type EnexParseResult = {
  notes: EnexNote[];
  warnings: string[];
  skipped: { rel: string; reason: string }[];
};

const MAX_ENEX_NOTE_BYTES = 1_000_000;
const MAX_ENEX_RESOURCE_BYTES = 25_000_000;

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      try {
        return String.fromCodePoint(Number(n));
      } catch {
        return "";
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      try {
        return String.fromCodePoint(parseInt(h, 16));
      } catch {
        return "";
      }
    });
}

function firstTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = re.exec(block);
  return m ? m[1]!.trim() : null;
}

function allTags(block: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) out.push(m[1]!.trim());
  return out;
}

/** Minimal pure-JS MD5 hex (RFC 1321) — matches Evernote en-media hashes
 * without a node:crypto dependency (core runs in renderer/mobile too). */
function md5HexAscii(input: string): string {
  function safeAdd(x: number, y: number): number {
    const lsw = (x & 0xffff) + (y & 0xffff);
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xffff);
  }
  function bitRotateLeft(num: number, cnt: number): number {
    return (num << cnt) | (num >>> (32 - cnt));
  }
  function md5cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
    return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
  }
  function md5ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return md5cmn((b & c) | (~b & d), a, b, x, s, t);
  }
  function md5gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return md5cmn((b & d) | (c & ~d), a, b, x, s, t);
  }
  function md5hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return md5cmn(b ^ c ^ d, a, b, x, s, t);
  }
  function md5ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return md5cmn(c ^ (b | ~d), a, b, x, s, t);
  }
  // Convert base64 payload to a byte string for hashing.
  let bytes: number[];
  try {
    const bin = typeof atob === "function" ? atob(input.replace(/\s+/g, "")) : Buffer.from(input.replace(/\s+/g, ""), "base64").toString("binary");
    bytes = Array.from(bin, (ch) => ch.charCodeAt(0) & 0xff);
  } catch {
    return "";
  }
  const origLen = bytes.length;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const bitLen = origLen * 8;
  for (let i = 0; i < 8; i++) bytes.push((bitLen >>> (i * 8)) & 0xff);
  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;
  for (let i = 0; i < bytes.length; i += 64) {
    const w = new Array<number>(16);
    for (let j = 0; j < 16; j++) w[j] = bytes[i + j * 4]! | (bytes[i + j * 4 + 1]! << 8) | (bytes[i + j * 4 + 2]! << 16) | (bytes[i + j * 4 + 3]! << 24);
    const aa = a;
    const bb = b;
    const cc = c;
    const dd = d;
    a = md5ff(a, b, c, d, w[0]!, 7, -680876936);
    d = md5ff(d, a, b, c, w[1]!, 12, -389564586);
    c = md5ff(c, d, a, b, w[2]!, 17, 606105819);
    b = md5ff(b, c, d, a, w[3]!, 22, -1044525330);
    a = md5ff(a, b, c, d, w[4]!, 7, -176418897);
    d = md5ff(d, a, b, c, w[5]!, 12, 1200080426);
    c = md5ff(c, d, a, b, w[6]!, 17, -1473231341);
    b = md5ff(b, c, d, a, w[7]!, 22, -45705983);
    a = md5ff(a, b, c, d, w[8]!, 7, 1770035416);
    d = md5ff(d, a, b, c, w[9]!, 12, -1958414417);
    c = md5ff(c, d, a, b, w[10]!, 17, -42063);
    b = md5ff(b, c, d, a, w[11]!, 22, -1990404162);
    a = md5ff(a, b, c, d, w[12]!, 7, 1804603682);
    d = md5ff(d, a, b, c, w[13]!, 12, -40341101);
    c = md5ff(c, d, a, b, w[14]!, 17, -1502002290);
    b = md5ff(b, c, d, a, w[15]!, 22, 1236535329);
    a = md5gg(a, b, c, d, w[1]!, 5, -165796510);
    d = md5gg(d, a, b, c, w[6]!, 9, -1069501632);
    c = md5gg(c, d, a, b, w[11]!, 14, 643717713);
    b = md5gg(b, c, d, a, w[0]!, 20, -373897302);
    a = md5gg(a, b, c, d, w[5]!, 5, -701558691);
    d = md5gg(d, a, b, c, w[10]!, 9, 38016083);
    c = md5gg(c, d, a, b, w[15]!, 14, -660478335);
    b = md5gg(b, c, d, a, w[4]!, 20, -405537848);
    a = md5gg(a, b, c, d, w[9]!, 5, 568446438);
    d = md5gg(d, a, b, c, w[14]!, 9, -1019803690);
    c = md5gg(c, d, a, b, w[3]!, 14, -187363961);
    b = md5gg(b, c, d, a, w[8]!, 20, 1163531501);
    a = md5gg(a, b, c, d, w[13]!, 5, -1444681467);
    d = md5gg(d, a, b, c, w[2]!, 9, -51403784);
    c = md5gg(c, d, a, b, w[7]!, 14, 1735328473);
    b = md5gg(b, c, d, a, w[12]!, 20, -1926607734);
    a = md5hh(a, b, c, d, w[5]!, 4, -378558);
    d = md5hh(d, a, b, c, w[8]!, 11, -2022574463);
    c = md5hh(c, d, a, b, w[11]!, 16, 1839030562);
    b = md5hh(b, c, d, a, w[14]!, 23, -35309556);
    a = md5hh(a, b, c, d, w[1]!, 4, -1530992060);
    d = md5hh(d, a, b, c, w[4]!, 11, 1272893353);
    c = md5hh(c, d, a, b, w[7]!, 16, -155497632);
    b = md5hh(b, c, d, a, w[10]!, 23, -1094730640);
    a = md5hh(a, b, c, d, w[13]!, 4, 681279174);
    d = md5hh(d, a, b, c, w[0]!, 11, -358537222);
    c = md5hh(c, d, a, b, w[3]!, 16, -722521979);
    b = md5hh(b, c, d, a, w[6]!, 23, 76029189);
    a = md5hh(a, b, c, d, w[9]!, 4, -640364487);
    d = md5hh(d, a, b, c, w[12]!, 11, -421815835);
    c = md5hh(c, d, a, b, w[15]!, 16, 530742520);
    b = md5hh(b, c, d, a, w[2]!, 23, -995338651);
    a = md5ii(a, b, c, d, w[0]!, 6, -198630844);
    d = md5ii(d, a, b, c, w[7]!, 10, 1126891415);
    c = md5ii(c, d, a, b, w[14]!, 15, -1416354905);
    b = md5ii(b, c, d, a, w[5]!, 21, -57434055);
    a = md5ii(a, b, c, d, w[12]!, 6, 1700485571);
    d = md5ii(d, a, b, c, w[3]!, 10, -1894986606);
    c = md5ii(c, d, a, b, w[10]!, 15, -1051523);
    b = md5ii(b, c, d, a, w[1]!, 21, -2054922799);
    a = md5ii(a, b, c, d, w[8]!, 6, 1873313359);
    d = md5ii(d, a, b, c, w[15]!, 10, -30611744);
    c = md5ii(c, d, a, b, w[6]!, 15, -1560198380);
    b = md5ii(b, c, d, a, w[13]!, 21, 1309151649);
    a = md5ii(a, b, c, d, w[4]!, 6, -145523070);
    d = md5ii(d, a, b, c, w[11]!, 10, -1120210379);
    c = md5ii(c, d, a, b, w[2]!, 15, 718787259);
    b = md5ii(b, c, d, a, w[9]!, 21, -343485551);
    a = safeAdd(a, aa);
    b = safeAdd(b, bb);
    c = safeAdd(c, cc);
    d = safeAdd(d, dd);
  }
  const hex = (n: number): string => {
    let s = "";
    for (let i = 0; i < 4; i++) s += ((n >> (i * 8 + 4)) & 0x0f).toString(16) + ((n >> (i * 8)) & 0x0f).toString(16);
    return s;
  };
  return hex(a) + hex(b) + hex(c) + hex(d);
}

/** Strip ENML wrapper: ENML is HTML with <en-note> root + <en-media> embeds.
 *  <en-media> becomes a normal <img> pointing at the resource filename so
 *  htmlToMarkdown + planImport map it to the copied attachment.
 *  Hash-matched (single document-order pass preserves original order). */
function enmlToHtml(enml: string, resources: EnexResource[]): string {
  let html = enml.replace(/^[\s\S]*?<en-note[^>]*>/i, "").replace(/<\/en-note\s*>[\s\S]*$/i, "");
  const byHash = new Map<string, EnexResource>();
  for (const r of resources) {
    if (r.hash) byHash.set(r.hash.toLowerCase(), r);
  }
  const queue = [...resources];
  let fallbackCount = 0;
  // Single pass: self-closing <en-media .../> and paired <en-media>...</en-media>
  // in document order (two separate passes would reorder references).
  html = html.replace(/<en-media\b([^>]*?)(?:\/\s*>|>([\s\S]*?)<\/en-media\s*>)/gi, (_m, attrs: string) => {
    const hashM = /hash\s*=\s*["']([0-9a-fA-F]+)["']/.exec(attrs ?? "");
    let r: EnexResource | undefined;
    if (hashM) {
      r = byHash.get(hashM[1]!.toLowerCase());
      if (r) {
        // Consume so a later hash-less element doesn't reuse it.
        const i = queue.indexOf(r);
        if (i >= 0) queue.splice(i, 1);
      }
    }
    if (!r) {
      // Order fallback for exports without hashes (e.g. minimal test fixtures).
      r = queue.shift();
      fallbackCount += 1;
    }
    const src = r ? r.filename.replace(/"/g, "") : `resource-${fallbackCount}.bin`;
    return `<img src="${src}">`;
  });
  // Preserve completed todos: checked="true" → - [x], else - [ ].
  html = html.replace(/<en-todo\b([^>]*?)(?:\/\s*>|>([\s\S]*?)<\/en-todo\s*>)/gi, (_m, attrs: string) => {
    const checked = /checked\s*=\s*["']?\s*true\s*["']?/i.test(attrs ?? "");
    return checked ? "- [x] " : "- [ ] ";
  });
  html = html.replace(/<\/?en-[a-z-]+\b[^>]*>/gi, "");
  return html;
}

function sanitizeStem(title: string, fallback: string): string {
  const base = title
    .replace(/[<>:"/\\|?*\0]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return base || fallback;
}

function mimeExt(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("png")) return ".png";
  if (m.includes("jpeg") || m.includes("jpg")) return ".jpg";
  if (m.includes("gif")) return ".gif";
  if (m.includes("webp")) return ".webp";
  if (m.includes("svg")) return ".svg";
  if (m.includes("pdf")) return ".pdf";
  if (m.includes("mp3") || m.includes("mpeg")) return ".mp3";
  if (m.includes("wav")) return ".wav";
  if (m.includes("mp4")) return ".mp4";
  if (m.includes("ogg")) return ".ogg";
  if (m.includes("webm")) return ".webm";
  return ".bin";
}

function uniqueAssetName(base: string, usedLower: Set<string>): string {
  if (!usedLower.has(base.toLowerCase())) return base;
  const dot = base.lastIndexOf(".");
  const stem = dot >= 0 ? base.slice(0, dot) : base;
  const ext = dot >= 0 ? base.slice(dot) : "";
  let k = 2;
  while (usedLower.has(`${stem} - ${k}${ext}`.toLowerCase())) k += 1;
  return `${stem} - ${k}${ext}`;
}

/** Parse `.enex` XML text into notes. Pure + total: never throws. */
export function parseEnex(xml: string): EnexParseResult {
  const result: EnexParseResult = { notes: [], warnings: [], skipped: [] };
  if (typeof xml !== "string" || !xml.includes("<note")) {
    result.warnings.push("No <note> entries found in .enex export.");
    return result;
  }
  const blocks = allTags(xml, "note");
  if (blocks.length === 0) {
    result.warnings.push("No <note> entries found in .enex export.");
    return result;
  }
  let n = 0;
  for (const block of blocks) {
    n += 1;
    try {
      const rawTitle = firstTag(block, "title");
      const title = rawTitle ? decodeEntities(rawTitle).trim() : `Untitled ${n}`;
      const created = firstTag(block, "created") ?? undefined;
      const updated = firstTag(block, "updated") ?? undefined;
      const tags = allTags(block, "tag").map((t) => decodeEntities(t).trim()).filter(Boolean);
      let content = firstTag(block, "content") ?? "";
      // Unwrap CDATA but keep its bytes literal: do NOT decodeEntities here.
      // CDATA preserves `&lt;` etc. literally; decoding first would turn
      // escaped text into real tags that htmlToMarkdown then strips.
      content = content.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
      // Parse resources.
      const resources: EnexResource[] = [];
      for (const rBlock of allTags(block, "resource")) {
        const dataMatch = /<data\b([^>]*)>([\s\S]*?)<\/data\s*>/i.exec(rBlock);
        if (!dataMatch) continue;
        const attrs = dataMatch[1] ?? "";
        if (!/encoding\s*=\s*["']base64["']/i.test(attrs)) continue;
        const b64 = dataMatch[2]!.replace(/\s+/g, "");
        if (!b64) continue;
        // Bound decoded size without decoding: 4 b64 chars ≈ 3 bytes.
        if (Math.ceil((b64.length * 3) / 4) > MAX_ENEX_RESOURCE_BYTES) {
          result.warnings.push(`Resource in "${title}" exceeds 25 MiB — skipped.`);
          continue;
        }
        const mime = firstTag(rBlock, "mime") ?? "application/octet-stream";
        const attrBlock = firstTag(rBlock, "resource-attributes") ?? "";
        const given = attrBlock ? firstTag(attrBlock, "file-name") : null;
        const filename = (given ? decodeEntities(given).trim() : "").replace(/[\\/]/g, "_") || `resource-${resources.length + 1}${mimeExt(mime)}`;
        const hash = md5HexAscii(b64);
        resources.push({ filename, mime, dataB64: b64, hash: hash || undefined });
      }
      if (content.length > MAX_ENEX_NOTE_BYTES * 4) {
        result.skipped.push({ rel: `${title}.enex-note`, reason: "note over 1 MiB cap" });
        continue;
      }
      const html = enmlToHtml(content, resources);
      result.notes.push({ title, created, updated, tags, html, resources });
    } catch {
      result.skipped.push({ rel: `note-${n}`, reason: "unparseable <note> block" });
    }
  }
  return result;
}

/** Convert parsed notes to planImport sources + attachment binaries.
 *  Returns sources for planImport plus a sidecar map of attachment rel →
 *  base64 bytes the host writes (bytes never cross planImport itself). */
export function enexToSources(parsed: EnexParseResult): {
  sources: ImportSourceFile[];
  attachmentBytes: Map<string, string>;
} {
  const sources: ImportSourceFile[] = [];
  const attachmentBytes = new Map<string, string>();
  // Distinct source rels: planImport dedupes case-insensitive inputs before
  // target collision handling, so two notes with the same title must not
  // share `evernote/<stem>.md` or the second vanishes without a skipped entry.
  const usedNoteLower = new Set<string>();
  const usedAssetLower = new Set<string>();
  const assetDataByLower = new Map<string, string>();
  let n = 0;
  for (const note of parsed.notes) {
    n += 1;
    const stem = sanitizeStem(note.title, `Untitled ${n}`);
    // Assign unique filenames to distinct resources up-front so the
    // markdown references point at the right bytes.
    const renamed = new Map<EnexResource, string>();
    for (const r of note.resources) {
      const candidate = `evernote/${r.filename}`;
      const lower = candidate.toLowerCase();
      const known = assetDataByLower.get(lower);
      if (!assetDataByLower.has(lower)) {
        assetDataByLower.set(lower, r.dataB64);
        usedAssetLower.add(lower);
        renamed.set(r, candidate);
      } else if (known === r.dataB64) {
        renamed.set(r, candidate);
      } else {
        const uniqueBase = uniqueAssetName(r.filename, new Set([...usedAssetLower].map((s) => s.replace(/^evernote\//i, ""))));
        // uniqueAssetName works on basenames; re-prefix
        const uniqueRel = `evernote/${uniqueBase}`;
        assetDataByLower.set(uniqueRel.toLowerCase(), r.dataB64);
        usedAssetLower.add(uniqueRel.toLowerCase());
        renamed.set(r, uniqueRel);
      }
    }
    // Rewrite <img src> refs in document order to the unique rels so each
    // note points at its own bytes even when filenames repeat.
    let html = note.html;
    if (note.resources.length > 0) {
      let ri = 0;
      html = html.replace(/<img\s+src="([^"]*)">/gi, (m, src: string) => {
        const r = note.resources[ri++];
        if (!r) return m;
        const uniqueRel = renamed.get(r);
        if (!uniqueRel) return m;
        const file = uniqueRel.replace(/^evernote\//, "");
        if (file === src) return m;
        return `<img src="${file}">`;
      });
    }
    const md = htmlToMarkdown(html);
    const front: string[] = [];
    if (note.tags.length > 0) front.push(`tags: [${note.tags.map((t) => JSON.stringify(t)).join(", ")}]`);
    if (note.created) front.push(`created: ${JSON.stringify(note.created)}`);
    if (note.updated) front.push(`updated: ${JSON.stringify(note.updated)}`);
    const body = front.length > 0 ? `---\n${front.join("\n")}\n---\n\n# ${stem}\n\n${md}` : `# ${stem}\n\n${md}`;
    let rel = `evernote/${stem}.md`;
    if (usedNoteLower.has(rel.toLowerCase())) {
      const dot = rel.lastIndexOf(".");
      const base = dot >= 0 ? rel.slice(0, dot) : rel;
      let k = 2;
      while (usedNoteLower.has(`${base} - ${k}.md`.toLowerCase())) k += 1;
      rel = `${base} - ${k}.md`;
    }
    usedNoteLower.add(rel.toLowerCase());
    sources.push({ rel, kind: "markdown", text: body });
    for (const r of note.resources) {
      const assetRel = renamed.get(r)!;
      if (!attachmentBytes.has(assetRel.toLowerCase())) {
        attachmentBytes.set(assetRel.toLowerCase(), r.dataB64);
        sources.push({ rel: assetRel, kind: "asset" });
      }
    }
  }
  return { sources, attachmentBytes };
}

/** One-call Elephant import: `.enex` text + plan opts → ImportPlan.
 *  Attachment base64 sidecar is returned alongside for the host to write. */
export function planEnexImport(
  xml: string,
  opts: ImportPlanOptions,
): { plan: ImportPlan; attachmentBytes: Map<string, string>; warnings: string[] } {
  const parsed = parseEnex(xml);
  const { sources, attachmentBytes } = enexToSources(parsed);
  if (sources.length === 0) {
    return {
      plan: { notes: [], attachments: [], unmapped: [], warnings: [...parsed.warnings], skipped: [...parsed.skipped] },
      attachmentBytes,
      warnings: parsed.warnings,
    };
  }
  const plan = planImport(sources, { targetDir: "evernote", ...opts });
  plan.warnings.unshift(...parsed.warnings);
  for (const s of parsed.skipped) plan.skipped.push(s);
  return { plan, attachmentBytes, warnings: [...parsed.warnings, ...plan.warnings] };
}
