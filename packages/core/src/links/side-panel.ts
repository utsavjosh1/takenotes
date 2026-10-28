/** Pure logic behind the side panel: headings, "Details" fields and safe single-line edits. */
import { extractAtxHeadings } from "../outline/extract.js";
import { parseDocument, stringify } from "yaml";
import { resolvePropertyType, updateFrontmatter, type PropertyRegistry } from "../index/properties.js";
import { isExplicitDate } from "../index/document.js";

export type PanelHeading = { text: string; line: number; indent: number };

/** Headings for "On this page". The first heading that repeats the note title is hidden on the page, so it is left out. */
export function panelHeadings(content: string, title: string): PanelHeading[] {
  const all = extractAtxHeadings(content);
  const dup = all.length > 0 && all[0]!.level === 1 && all[0]!.text.trim().toLowerCase() === title.trim().toLowerCase();
  return (dup ? all.slice(1) : all).map((h) => ({ text: h.text, line: h.line, indent: Math.min(Math.max(h.level - 1, 0), 2) }));
}

export type DetailKind = "text" | "number" | "checkbox" | "date" | "datetime";
export type DetailField = { name: string; kind: DetailKind; value: string | number | boolean; list: boolean };

function kindOf(name: string, value: unknown, registry?: PropertyRegistry): DetailKind {
  const t = resolvePropertyType(registry, name);
  if (t === "checkbox" || typeof value === "boolean") return "checkbox";
  if (t === "number" || typeof value === "number") return "number";
  if (typeof value === "string" && isExplicitDate(value)) return /[T ]\d{2}:\d{2}/.test(value) ? "datetime" : "date";
  if (t === "datetime") return "datetime";
  if (t === "date") return "date";
  return "text";
}

/** One editable field per detail. Lists show as comma separated text. Nested values are skipped (edit as text). */
export function detailFields(frontmatter: Record<string, unknown>, registry?: PropertyRegistry): DetailField[] {
  const out: DetailField[] = [];
  for (const name of Object.keys(frontmatter)) {
    const v = frontmatter[name];
    if (Array.isArray(v)) {
      if (v.every((x) => ["string", "number", "boolean"].includes(typeof x))) out.push({ name, kind: "text", value: v.join(", "), list: true });
      continue;
    }
    if (v !== null && typeof v === "object") continue;
    if (v === null || v === undefined) { out.push({ name, kind: "text", value: "", list: false }); continue; }
    const kind = kindOf(name, v, registry);
    out.push({ name, kind, value: kind === "datetime" || kind === "date" ? String(v).replace(" ", "T") : (v as string | number | boolean), list: false });
  }
  return out;
}

const scalar = (v: string | number | boolean): string => stringify(v, { lineWidth: 0 }).trimEnd();

/** Rewrites one detail in the note text. Only that detail's line changes; comments, order, quoting and line endings elsewhere stay as they are. */
export function editDetail(
  content: string,
  field: DetailField,
  raw: string | number | boolean,
): { content: string } | { error: string } {
  let text: string;
  if (field.list) {
    const items = String(raw).split(",").map((x) => x.trim()).filter(Boolean);
    text = `[${items.map(scalar).join(", ")}]`;
  } else if (field.kind === "number") {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n) || String(raw).trim() === "") return { error: "Enter a number." };
    text = String(n);
  } else if (field.kind === "checkbox") {
    text = raw === true || raw === "true" ? "true" : "false";
  } else if (field.kind === "date" || field.kind === "datetime") {
    const s = String(raw).replace("T", " ");
    if (!isExplicitDate(s)) return { error: "Enter a date." };
    text = field.kind === "date" ? s.slice(0, 10) : String(raw).replace("T", " ");
  } else {
    if (String(raw) === "") return { error: "A detail can’t be empty. Use Edit as plain text to remove it." };
    text = scalar(String(raw));
  }
  // Locate the block: first line `---`, closing `---` within 500 lines.
  const lines = content.split(/(?<=\n)/);
  if (!/^(\uFEFF)?---[ \t]*\r?\n?$/.test(lines[0] ?? "")) return { error: "This note has no details block." };
  const limit = Math.min(lines.length, 500);
  let close = -1;
  for (let i = 1; i < limit; i++) if (/^(---|\.\.\.)[ \t]*\r?\n?$/.test(lines[i]!)) { close = i; break; }
  if (close < 0) return { error: "The details block is not closed." };
  const keyRe = new RegExp(`^(${field.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[ \\t]*:[ \\t]*)(.*?)(\\r?\\n?)$`);
  for (let i = 1; i < close; i++) {
    const m = keyRe.exec(lines[i]!);
    if (!m) continue;
    const old = m[2]!;
    const next = lines[i + 1] ?? "";
    if ((old === "" || /^[|>]/.test(old)) && i + 1 < close && /^(\s+|-\s)/.test(next)) return { error: "Use Edit as plain text for this detail." };
    // Keep a trailing comment (` # ...`) when the old value is not quoted.
    const comment = !/^["']/.test(old) ? /(\s+#.*)$/.exec(old)?.[1] ?? "" : "";
    const out = lines.slice();
    out[i] = `${m[1]}${text}${comment}${m[3]}`;
    return { content: out.join("") };
  }
  return { error: "That detail was not found." };
}

/** True when the note starts a details block that can't be read (so edits here would be refused). */
export function detailsAreBroken(content: string): boolean {
  if (!/^(\uFEFF)?---[ \t]*\r?\n/.test(content)) return false;
  const res = updateFrontmatter(content, { status: "x" });
  return "error" in res && /unparseable|not a map/i.test(res.error.message);
}

/** Details read straight from the note text (so the panel is correct before the index catches up). */
export function readDetails(content: string, registry?: PropertyRegistry): { fields: DetailField[]; broken: boolean } {
  const lines = content.split(/\r?\n/);
  if (!/^(\uFEFF)?---[ \t]*$/.test(lines[0] ?? "")) return { fields: [], broken: false };
  const limit = Math.min(lines.length, 500);
  let close = -1;
  for (let i = 1; i < limit; i++) if (/^(---|\.\.\.)[ \t]*$/.test(lines[i]!)) { close = i; break; }
  if (close < 0) return { fields: [], broken: true };
  const doc = parseDocument(lines.slice(1, close).join("\n"));
  if (doc.errors.length > 0) return { fields: [], broken: true };
  const js = doc.toJS() as unknown;
  if (js === null || js === undefined) return { fields: [], broken: false };
  if (typeof js !== "object" || Array.isArray(js)) return { fields: [], broken: true };
  return { fields: detailFields(js as Record<string, unknown>, registry), broken: false };
}
