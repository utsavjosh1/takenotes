import { Document, isMap, parseDocument } from "yaml";
import { appError, type AppError } from "@takenotes/contracts/errors";
import { isExplicitDate } from "./document";

/** Step 3b — Properties round-trip + per-name type registry.
 *
 * Locked contract (3b grill):
 * - **Frontmatter** is the raw YAML map on disk (storage truth, ADR-0008).
 * - **Properties** is a typed interpretation through the registry — a
 *   lossless lens. Reads never coerce, rewrite, or normalize disk.
 * - Coercion happens only inside an explicit `updateFrontmatter` patch, and
 *   only for the fields the patch names. Unrelated YAML (comments, quoting,
 *   key order, untouched fields) is preserved via the `yaml` Document API.
 * - `tags: single`, `tags: [a, b]`, and missing `tags` stay distinguishable
 *   on disk; the registry never rewrites them on read.
 */

export const PROPERTY_TYPES = ["text", "list-text", "number", "checkbox", "date", "datetime", "tags"] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];

export type PropertyRegistry = Record<string, PropertyType>;

/** V1 defaults (locked 3b): `tags → tags`, `aliases → list-text`,
 * `cssclasses → list-text`. Unknown names interpret as `text` unless the
 * workspace registry says otherwise. */
export const DEFAULT_PROPERTY_TYPES: Readonly<Record<string, PropertyType>> = {
  tags: "tags",
  aliases: "list-text",
  cssclasses: "list-text",
};

function isValidType(value: unknown): value is PropertyType {
  return typeof value === "string" && (PROPERTY_TYPES as readonly string[]).includes(value);
}

function isPatchableKey(key: string): boolean {
  return key !== "__proto__" && key !== "constructor" && key !== "prototype";
}

/** Parse a stored registry (app-data, keyed by workspace outside this
 * module). Total: non-objects yield `{}`, corrupt entries drop, unknown
 * keys are ignored — mirroring `parseSettings` degradation. */
export function parsePropertyRegistry(input: unknown): PropertyRegistry {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return {};
  const out: PropertyRegistry = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!key || !isPatchableKey(key)) continue;
    if (isValidType(value)) out[key] = value;
  }
  return out;
}

/** Resolve the interpretation type for one property name: explicit
 * workspace entry, else V1 default, else `text`. */
export function resolvePropertyType(registry: PropertyRegistry | undefined, name: string): PropertyType {
  const explicit = registry !== undefined && isPatchableKey(name) ? registry[name] : undefined;
  if (explicit !== undefined) return explicit;
  return DEFAULT_PROPERTY_TYPES[name] ?? "text";
}

/** Typed-lens read of one raw frontmatter value. Total: anything
 * unrepresentable yields `undefined` (never throws, never touches disk). */
export function interpretProperty(type: PropertyType, value: unknown): unknown {
  switch (type) {
    case "text":
      if (typeof value === "string") return value;
      if (typeof value === "number" || typeof value === "boolean") return String(value);
      return undefined;
    case "list-text":
      if (typeof value === "string") return value === "" ? [] : [value];
      if (Array.isArray(value)) {
        const out: string[] = [];
        for (const item of value) {
          if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") out.push(String(item));
        }
        return out;
      }
      return [];
    case "tags":
      if (typeof value === "string") return value.split(/[\s,]+/).filter(Boolean);
      if (Array.isArray(value)) {
        const out: string[] = [];
        for (const item of value) {
          if (typeof item === "string") out.push(...item.split(/[\s,]+/).filter(Boolean));
          else if (typeof item === "number" || typeof item === "boolean") out.push(String(item));
        }
        return out;
      }
      return [];
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? value : undefined;
    case "checkbox":
      return typeof value === "boolean" ? value : undefined;
    case "date":
    case "datetime":
      return typeof value === "string" && isExplicitDate(value) ? value.trim() : undefined;
  }
}

function canonicalizeForWrite(
  key: string,
  type: PropertyType,
  value: unknown,
): { value: unknown } | { error: AppError } {
  const bad = (expected: string) => ({
    error: appError("INVALID_REQUEST", `Invalid value for property "${key}": expected ${expected}.`),
  });
  switch (type) {
    case "text":
      return typeof value === "string" ? { value } : bad("text");
    case "list-text":
      if (typeof value === "string") return { value: value === "" ? [] : [value] };
      if (Array.isArray(value)) {
        const out: string[] = [];
        for (const item of value) {
          if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
            const s = String(item);
            if (s) out.push(s);
          } else return bad("a string or list of scalars");
        }
        return { value: out };
      }
      return bad("a string or list of scalars");
    case "tags": {
      const split = (s: string): string[] => s.split(/[\s,]+/).filter(Boolean);
      if (typeof value === "string") return { value: split(value) };
      if (Array.isArray(value)) {
        const out: string[] = [];
        for (const item of value) {
          if (typeof item === "string") out.push(...split(item));
          else if (typeof item === "number" || typeof item === "boolean") out.push(String(item));
          else return bad("a string or list of scalars");
        }
        return { value: out };
      }
      return bad("a string or list of scalars");
    }
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? { value } : bad("a finite number");
    case "checkbox":
      return typeof value === "boolean" ? { value } : bad("true or false");
    case "date":
    case "datetime":
      return typeof value === "string" && isExplicitDate(value)
        ? { value: value.trim() }
        : bad("an explicit date (YYYY-MM-DD, optional THH:MM[:SS])");
  }
}

const MAX_FRONTMATTER_SCAN_LINES = 500;

type Split = {
  hadFrontmatter: boolean;
  frontmatterText: string;
  closingMarker: string;
  bodyLines: string[];
};

/** Locate the frontmatter block with the same fence rules as the index
 * parser (opening `---` on the first line, closing `---`/`...` within 500
 * lines). No closing fence → the whole file is body. */
function splitFrontmatter(lines: string[]): Split {
  if (!/^---\s*$/.test(lines[0] ?? "")) return { hadFrontmatter: false, frontmatterText: "", closingMarker: "---", bodyLines: lines };
  const limit = Math.min(lines.length, MAX_FRONTMATTER_SCAN_LINES);
  for (let i = 1; i < limit; i++) {
    const line = lines[i]!;
    if (/^---\s*$/.test(line)) {
      return { hadFrontmatter: true, frontmatterText: lines.slice(1, i).join("\n"), closingMarker: "---", bodyLines: lines.slice(i + 1) };
    }
    if (/^\.\.\.\s*$/.test(line)) {
      return { hadFrontmatter: true, frontmatterText: lines.slice(1, i).join("\n"), closingMarker: "...", bodyLines: lines.slice(i + 1) };
    }
  }
  return { hadFrontmatter: false, frontmatterText: "", closingMarker: "---", bodyLines: lines };
}

/**
 * Pure frontmatter patch: apply `patch` to the YAML block, preserve
 * everything else byte-for-byte (body, BOM, newline convention, comments
 * and formatting of untouched fields).
 *
 * - `patch` values set fields (validated + canonicalized per the resolved
 *   registry type); `undefined` deletes the field. `null` is rejected —
 *   deletion is spelled `undefined` so a YAML-null write stays explicit.
 * - Unparseable existing frontmatter (or a non-map root) fails with
 *   `INVALID_REQUEST` and modifies nothing.
 * - An empty patch returns the input unchanged. Deleting every key drops
 *   the block and returns the body.
 */
export function updateFrontmatter(
  content: string,
  patch: Record<string, unknown>,
  registry?: PropertyRegistry,
): { content: string } | { error: AppError } {
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    return { error: appError("INVALID_REQUEST", "Property patch must be an object.") };
  }
  const entries = Object.entries(patch);
  for (const [key] of entries) {
    if (!key || !isPatchableKey(key)) {
      return { error: appError("INVALID_REQUEST", `Invalid property name "${key}".`) };
    }
  }

  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const bom = content.startsWith("﻿") ? "﻿" : "";
  const raw = bom ? content.slice(1) : content;
  const lines = raw.split(/\r\n|\r|\n/);
  const split = splitFrontmatter(lines);

  if (entries.length === 0) return { content };

  // Ambiguous: looks like a frontmatter fence but never closes. The index
  // parser treats it as body — the writer fails closed instead of stacking
  // a second block on top of a possibly-intended one.
  if (!split.hadFrontmatter && /^---\s*$/.test(lines[0] ?? "")) {
    return { error: appError("INVALID_REQUEST", "Existing frontmatter is unparseable; refusing to modify it.") };
  }

  let doc: Document;
  if (!split.hadFrontmatter) {
    // An empty parsed document (not `new Document(null)`, whose null
    // contents reject `set`).
    doc = parseDocument("");
  } else {
    doc = parseDocument(split.frontmatterText);
    if (doc.errors.length > 0) {
      return { error: appError("INVALID_REQUEST", "Existing frontmatter is unparseable; refusing to modify it.") };
    }
    if (doc.contents !== null && !isMap(doc.contents)) {
      return { error: appError("INVALID_REQUEST", "Existing frontmatter is not a map; refusing to modify it.") };
    }
  }

  for (const [key, value] of entries) {
    if (value === undefined) {
      doc.delete(key);
      continue;
    }
    if (value === null) {
      return { error: appError("INVALID_REQUEST", `Invalid value for property "${key}": deletion is spelled undefined.`) };
    }
    const canonical = canonicalizeForWrite(key, resolvePropertyType(registry, key), value);
    if ("error" in canonical) return canonical;
    doc.set(key, canonical.value);
  }

  const empty = doc.contents === null || (isMap(doc.contents) && doc.contents.items.length === 0);
  if (empty) {
    if (!split.hadFrontmatter) return { content };
    return { content: bom + split.bodyLines.join(newline) };
  }

  // `yaml` serializes with `\n`; convert to the file's convention so a CRLF
  // file stays CRLF. Only the block is rebuilt — the body rejoins untouched.
  const yamlText = doc.toString().replace(/\n/g, newline);
  const head = `---${newline}${yamlText}${split.closingMarker}${newline}`;
  return { content: bom + head + split.bodyLines.join(newline) };
}
