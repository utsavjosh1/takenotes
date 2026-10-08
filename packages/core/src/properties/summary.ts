import { Document, isMap, parseDocument } from "yaml";
import { appError, type AppError } from "@takenotes/contracts/errors";
import { resolvePropertyType, type PropertyRegistry, type PropertyType } from "../index/properties";

/** Step 6 Properties view — pure aggregation + renames over frontmatter.
 *
 * Summaries read raw frontmatter maps (never the registry's
 * interpretation): `type` is the resolved interpretation for display,
 * `files` counts notes carrying the key, `values` holds distinct
 * stringified samples (capped) for the click-to-search affordance. Total:
 * malformed entries degrade to skips, never throws.
 */

export const MAX_SAMPLE_VALUES = 20;
export const MAX_VALUE_LEN = 120;

export type PropertySummary = {
  name: string;
  type: PropertyType;
  /** Files carrying the key (including explicit-null values). */
  files: number;
  /** Distinct stringified values, insertion order, capped. */
  values: string[];
  /** True when every observed value is null/undefined. */
  allNull: boolean;
};

export type PropertySort = "name" | "frequency";

type Propertied = { relativePath: string; frontmatter: unknown };

function stringifyValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  let s: string;
  if (typeof value === "string") s = value;
  else if (typeof value === "number" || typeof value === "boolean") s = String(value);
  else {
    try {
      s = JSON.stringify(value) ?? "";
    } catch {
      return null;
    }
  }
  s = s.trim();
  if (!s) return null;
  return s.length > MAX_VALUE_LEN ? `${s.slice(0, MAX_VALUE_LEN - 1)}…` : s;
}

function isPatchableKey(key: string): boolean {
  return key !== "__proto__" && key !== "constructor" && key !== "prototype";
}

/** Aggregate all-properties across entries. Paths dedupe per key (one
 * entry carries a key once by construction, but belt-and-braces). */
export function summarizeProperties(entries: Propertied[], registry?: PropertyRegistry): PropertySummary[] {
  const byName = new Map<string, { files: Set<string>; values: string[]; seen: Set<string>; nulls: number }>();
  for (const entry of entries ?? []) {
    if (!entry || typeof entry !== "object") continue;
    const fm = (entry as Propertied).frontmatter;
    if (typeof fm !== "object" || fm === null || Array.isArray(fm)) continue;
    const rel = typeof (entry as Propertied).relativePath === "string" ? (entry as Propertied).relativePath : "";
    for (const [key, value] of Object.entries(fm as Record<string, unknown>)) {
      if (!key || !isPatchableKey(key)) continue;
      let slot = byName.get(key);
      if (!slot) {
        slot = { files: new Set(), values: [], seen: new Set(), nulls: 0 };
        byName.set(key, slot);
      }
      slot.files.add(rel);
      const s = stringifyValue(value);
      if (s === null) {
        slot.nulls += 1;
        continue;
      }
      if (!slot.seen.has(s) && slot.values.length < MAX_SAMPLE_VALUES) {
        slot.seen.add(s);
        slot.values.push(s);
      }
    }
  }
  return [...byName.entries()].map(([name, slot]) => ({
    name,
    type: resolvePropertyType(registry, name),
    files: slot.files.size,
    values: slot.values,
    allNull: slot.values.length === 0,
  }));
}

export function sortPropertySummaries(summaries: PropertySummary[], sort: PropertySort): PropertySummary[] {
  return [...summaries].sort((a, b) =>
    sort === "frequency" && a.files !== b.files
      ? b.files - a.files || (a.name < b.name ? -1 : 1)
      : a.name < b.name
        ? -1
        : a.name > b.name
          ? 1
          : 0,
  );
}

/** Click-to-search query for a property (with or without a value). Values
 * with spaces quote; embedded quotes are escaped for the V2 grammar. */
export function propertySearchQuery(name: string, value?: string): string {
  if (value === undefined) return `[${name}]`;
  const needsQuote = /[\s"\]]/.test(value);
  const v = needsQuote ? `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : value;
  return `[${name}:${v}]`;
}

function validName(name: string): boolean {
  return !!name && !/[\s[\]:]/.test(name) && isPatchableKey(name);
}

/**
 * Pure single-file property rename: move `oldName` to `newName` inside
 * the YAML block, preserving everything else via the `yaml` Document API
 * (same guarantees as `updateFrontmatter`).
 *
 * - Missing `oldName` → input unchanged (rename is a bulk op; absent keys
 *   are skips, not errors).
 * - Unparseable/non-map frontmatter → `INVALID_REQUEST`, nothing modified.
 * - `newName` already present → `INVALID_REQUEST` (refuse to clobber).
 * - Bad names → `INVALID_REQUEST`.
 * - Body, BOM, and newline convention preserved byte-for-byte.
 */
export function renamePropertyKey(
  content: string,
  oldName: string,
  newName: string,
): { content: string } | { error: AppError } {
  if (!validName(oldName) || !validName(newName)) {
    return { error: appError("INVALID_REQUEST", "Invalid property name.") };
  }
  if (oldName === newName) return { content };
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const bom = content.startsWith("﻿") ? "﻿" : "";
  const raw = bom ? content.slice(1) : content;
  const lines = raw.split(/\r\n|\r|\n/);
  if (!/^---\s*$/.test(lines[0] ?? "")) return { content };
  const limit = Math.min(lines.length, 500);
  let close = -1;
  let marker = "---";
  for (let i = 1; i < limit; i++) {
    if (/^---\s*$/.test(lines[i]!)) {
      close = i;
      marker = "---";
      break;
    }
    if (/^\.\.\.\s*$/.test(lines[i]!)) {
      close = i;
      marker = "...";
      break;
    }
  }
  if (close < 0) return { content };
  const doc: Document = parseDocument(lines.slice(1, close).join("\n"));
  if (doc.errors.length > 0) {
    return { error: appError("INVALID_REQUEST", "Existing frontmatter is unparseable; refusing to modify it.") };
  }
  if (doc.contents !== null && !isMap(doc.contents)) {
    return { error: appError("INVALID_REQUEST", "Existing frontmatter is not a map; refusing to modify it.") };
  }
  if (!doc.has(oldName)) return { content };
  if (doc.has(newName)) {
    return { error: appError("INVALID_REQUEST", `Property "${newName}" already exists; refusing to clobber it.`) };
  }
  const value = doc.get(oldName, true);
  doc.set(newName, value);
  doc.delete(oldName);
  const yamlText = doc.toString().replace(/\n/g, newline);
  const head = `---${newline}${yamlText}${marker}${newline}`;
  return { content: bom + head + lines.slice(close + 1).join(newline) };
}
