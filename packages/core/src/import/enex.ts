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

/** Strip ENML wrapper: ENML is HTML with <en-note> root + <en-media> embeds.
 *  <en-media> becomes a normal <img> pointing at the resource filename so
 *  htmlToMarkdown + planImport map it to the copied attachment. */
function enmlToHtml(enml: string, resources: EnexResource[]): string {
  let html = enml.replace(/^[\s\S]*?<en-note[^>]*>/i, "").replace(/<\/en-note\s*>[\s\S]*$/i, "");
  // <en-media hash=".." type="image/png"/> → <img src="filename">
  // Resources in .enex rarely carry hash→filename mapping inline; match by order.
  let idx = 0;
  html = html.replace(/<en-media\b[^>]*\/\s*>/gi, () => {
    const r = resources[idx++];
    const src = r ? r.filename.replace(/"/g, "") : `resource-${idx}.bin`;
    return `<img src="${src}">`;
  });
  html = html.replace(/<en-media\b[^>]*>([\s\S]*?)<\/en-media\s*>/gi, () => {
    const r = resources[idx++];
    const src = r ? r.filename.replace(/"/g, "") : `resource-${idx}.bin`;
    return `<img src="${src}">`;
  });
  // Drop ENML-specific todo/crypt wrappers but keep inner text.
  html = html.replace(/<en-todo\b[^>]*\/\s*>/gi, "- [ ] ");
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
      // Unwrap CDATA.
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
        resources.push({ filename, mime, dataB64: b64 });
      }
      if (content.length > MAX_ENEX_NOTE_BYTES * 4) {
        result.skipped.push({ rel: `${title}.enex-note`, reason: "note over 1 MiB cap" });
        continue;
      }
      const html = enmlToHtml(decodeEntities(content), resources);
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
  let n = 0;
  for (const note of parsed.notes) {
    n += 1;
    const stem = sanitizeStem(note.title, `Untitled ${n}`);
    const md = htmlToMarkdown(note.html);
    const front: string[] = [];
    if (note.tags.length > 0) front.push(`tags: [${note.tags.map((t) => JSON.stringify(t)).join(", ")}]`);
    if (note.created) front.push(`created: ${JSON.stringify(note.created)}`);
    if (note.updated) front.push(`updated: ${JSON.stringify(note.updated)}`);
    const body = front.length > 0 ? `---\n${front.join("\n")}\n---\n\n# ${stem}\n\n${md}` : `# ${stem}\n\n${md}`;
    const rel = `evernote/${stem}.md`;
    sources.push({ rel, kind: "markdown", text: body });
    for (const r of note.resources) {
      const assetRel = `evernote/${r.filename}`;
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
