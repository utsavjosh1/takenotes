/** Step 6 Collections — traveling structured-query definitions (no IO).
 *
 * A Collection is a saved query over workspace metadata with named views.
 * Definitions travel with the workspace as YAML files under
 * `.takenotes/collections/*.yaml` (same rule as Favorites, ADR-0008);
 * machine state (index, registry) stays local. MVP views are `table` and
 * `list` only — no cards/board/calendar, no formulas, no summaries.
 */
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export const COLLECTIONS_DIR = ".takenotes/collections";
export const COLLECTION_VERSION = 1;

/** MVP view kinds (locked): table + list. Anything else is rejected. */
export const COLLECTION_VIEW_KINDS = ["table", "list"] as const;
export type CollectionViewKind = (typeof COLLECTION_VIEW_KINDS)[number];

export type CollectionSortKey = "name" | "modified" | "created" | "path" | "property";
export type CollectionSort = {
  key: CollectionSortKey;
  dir: "asc" | "desc";
  /** Required when `key` is `property`: the frontmatter name to sort by. */
  property?: string;
};

export type CollectionView = {
  name: string;
  kind: CollectionViewKind;
  /** Table columns (frontmatter names, in order). Empty/omitted = title + all. */
  columns?: string[];
  sort?: CollectionSort;
};

export type CollectionDoc = {
  version: 1;
  /** Display name (also the default file stem). */
  name: string;
  /** Search-grammar query string evaluated per view. */
  query: string;
  views: CollectionView[];
};

export const MAX_COLLECTION_QUERY_LEN = 2000;
const MAX_VIEWS = 20;
const MAX_COLUMNS = 20;

function isPatchableKey(key: string): boolean {
  return key !== "__proto__" && key !== "constructor" && key !== "prototype";
}

function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().slice(0, 80);
  return t ? t : null;
}

function cleanColumn(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().slice(0, 80);
  if (!t || /[\s[\]:]/.test(t) || !isPatchableKey(t)) return null;
  return t;
}

function validateSort(raw: unknown): CollectionSort | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const key = r["key"];
  const dir = r["dir"];
  if (key !== "name" && key !== "modified" && key !== "created" && key !== "path" && key !== "property") return null;
  if (dir !== "asc" && dir !== "desc") return null;
  if (key === "property") {
    const prop = cleanColumn(r["property"]);
    if (!prop) return null;
    return { key, dir, property: prop };
  }
  return { key, dir };
}

function validateView(raw: unknown): CollectionView | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const name = cleanName(r["name"]);
  if (!name) return null;
  const kind = r["kind"];
  if (kind !== "table" && kind !== "list") return null;
  const view: CollectionView = { name, kind };
  if (r["columns"] !== undefined) {
    if (!Array.isArray(r["columns"])) return null;
    const cols: string[] = [];
    for (const c of r["columns"]) {
      const clean = cleanColumn(c);
      if (!clean || cols.includes(clean)) return null;
      cols.push(clean);
    }
    if (cols.length === 0 || cols.length > MAX_COLUMNS) return null;
    view.columns = cols;
  }
  if (r["sort"] !== undefined) {
    const sort = validateSort(r["sort"]);
    if (!sort) return null;
    view.sort = sort;
  }
  return view;
}

/** Parse one collection file. Total: bad YAML → default doc + error;
 * invalid fields drop the view (or the doc when name/query are bad) with
 * errors reported — the file on disk is never touched here. */
export function parseCollectionDoc(text: string, fallbackName: string): { doc: CollectionDoc; errors: string[] } {
  const errors: string[] = [];
  const fallback: CollectionDoc = {
    version: 1,
    name: cleanName(fallbackName) ?? "Untitled",
    query: "",
    views: [{ name: "Table", kind: "table" }],
  };
  if (!text.trim()) return { doc: fallback, errors };
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch {
    return { doc: fallback, errors: ["invalid YAML — starting empty; your file is untouched"] };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { doc: fallback, errors: ["invalid collection doc"] };
  }
  const r = raw as Record<string, unknown>;
  const name = cleanName(r["name"]);
  if (!name) {
    errors.push("missing collection name — using filename");
  }
  const queryRaw = typeof r["query"] === "string" ? r["query"] : "";
  if (typeof r["query"] !== "string") errors.push("missing query — matching nothing");
  const query = queryRaw.slice(0, MAX_COLLECTION_QUERY_LEN);
  if (queryRaw.length > MAX_COLLECTION_QUERY_LEN) errors.push("query truncated to 2000 chars");
  const views: CollectionView[] = [];
  const list = Array.isArray(r["views"]) ? r["views"] : [];
  for (const v of list.slice(0, MAX_VIEWS)) {
    const validated = validateView(v);
    if (!validated) {
      errors.push("skipped invalid view");
      continue;
    }
    if (views.some((x) => x.name === validated.name)) {
      errors.push(`skipped duplicate view "${validated.name}"`);
      continue;
    }
    views.push(validated);
  }
  if (list.length > MAX_VIEWS) errors.push(`only the first ${MAX_VIEWS} views kept`);
  if (views.length === 0) {
    errors.push("no valid views — added default table view");
    views.push({ name: "Table", kind: "table" });
  }
  return { doc: { version: 1, name: name ?? fallback.name, query, views }, errors };
}

export function serializeCollectionDoc(doc: CollectionDoc): string {
  return stringifyYaml({
    version: 1,
    name: doc.name,
    query: doc.query,
    views: doc.views.map((v) => ({
      name: v.name,
      kind: v.kind,
      ...(v.columns === undefined ? {} : { columns: v.columns }),
      ...(v.sort === undefined ? {} : { sort: v.sort }),
    })),
  });
}

export function emptyCollectionDoc(name: string): CollectionDoc {
  return { version: 1, name: cleanName(name) ?? "Untitled", query: "", views: [{ name: "Table", kind: "table" }] };
}

/** File stem for a collection name (`My View` → `My View.yaml`). Stems
 * are validated on load the same way — escape attempts rejected. */
export function collectionFileName(name: string): string | null {
  const clean = cleanName(name);
  if (!clean || clean === "." || clean === "..") return null;
  if (clean.includes("/") || clean.includes("\\") || clean.includes("\0")) return null;
  // eslint-disable-next-line no-control-regex
  if (/[<>:"|?*\u0000-\u001f]/.test(clean)) return null;
  return `${clean}.yaml`;
}

export function addCollectionView(doc: CollectionDoc, view: CollectionView): CollectionDoc {
  const validated = validateView(view);
  if (!validated || doc.views.length >= MAX_VIEWS) return doc;
  if (doc.views.some((v) => v.name === validated.name)) return doc;
  return { ...doc, views: [...doc.views, validated] };
}

export function removeCollectionView(doc: CollectionDoc, name: string): CollectionDoc {
  if (doc.views.length <= 1) return doc;
  return { ...doc, views: doc.views.filter((v) => v.name !== name) };
}

export function renameCollectionView(doc: CollectionDoc, oldName: string, newName: string): CollectionDoc {
  const clean = cleanName(newName);
  if (!clean || doc.views.some((v) => v.name === clean)) return doc;
  return { ...doc, views: doc.views.map((v) => (v.name === oldName ? { ...v, name: clean } : v)) };
}
