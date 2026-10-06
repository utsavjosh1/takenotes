/**
 * Step 2 Favorites pure store (testable, no IO).
 * Travels with the workspace at `.takenotes/favorites.yaml` (ADR-0008:
 * user files authoritative, `.takenotes/` holds traveling definitions).
 */
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export const FAVORITES_REL = ".takenotes/favorites.yaml";
export const FAVORITES_VERSION = 1;

export type FavoriteType = "file" | "folder" | "search" | "heading" | "block";

export type FavoriteEntry = {
  type: FavoriteType;
  /** file/folder: canonical rel; search: query string; heading/block: `rel#frag`. */
  target: string;
  alias?: string | null;
};

export type FavoriteGroup = { name: string; entries: FavoriteEntry[] };
export type FavoritesDoc = { version: 1; groups: FavoriteGroup[] };

export function emptyFavoritesDoc(): FavoritesDoc {
  return { version: 1, groups: [{ name: "default", entries: [] }] };
}

function isValidRel(rel: string): boolean {
  if (!rel || rel.includes("\0")) return false;
  const norm = rel.replaceAll("\\", "/");
  if (norm.startsWith("/") || norm === "" ) return false;
  const parts = norm.split("/");
  for (const p of parts) {
    if (!p || p === "." || p === "..") return false;
    // eslint-disable-next-line no-control-regex
    if (/[<>:"|?*\u0000-\u001f]/.test(p)) return false;
  }
  return true;
}

function validateEntry(raw: unknown): FavoriteEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const type = r["type"];
  const target = r["target"];
  if (type !== "file" && type !== "folder" && type !== "search" && type !== "heading" && type !== "block") return null;
  if (typeof target !== "string" || !target.trim()) return null;
  const t = target.trim();
  if (type === "file" || type === "folder") {
    if (!isValidRel(t)) return null;
  } else if (type === "search") {
    if (t.length > 500) return null;
  } else {
    const hash = t.lastIndexOf("#");
    if (hash < 0) return null;
    const rel = t.slice(0, hash);
    const frag = t.slice(hash + 1);
    if (!isValidRel(rel) || !frag) return null;
    if (type === "block" && !frag.startsWith("^")) return null;
    if (type === "heading" && frag.startsWith("^")) return null;
  }
  const alias = r["alias"];
  return {
    type,
    target: t,
    ...(typeof alias === "string" && alias.trim() ? { alias: alias.trim().slice(0, 120) } : {}),
  };
}

export function parseFavoritesDoc(text: string): { doc: FavoritesDoc; errors: string[] } {
  const errors: string[] = [];
  if (!text.trim()) return { doc: emptyFavoritesDoc(), errors };
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch {
    // Invalid YAML never destroys content: fall back to empty, report.
    return { doc: emptyFavoritesDoc(), errors: ["invalid YAML — starting empty; your file is untouched"] };
  }
  if (typeof raw !== "object" || raw === null) return { doc: emptyFavoritesDoc(), errors: ["invalid favorites doc"] };
  const r = raw as Record<string, unknown>;
  const groupsRaw = Array.isArray(r["groups"]) ? r["groups"] : [];
  const groups: FavoriteGroup[] = [];
  for (const g of groupsRaw) {
    if (typeof g !== "object" || g === null) { errors.push("skipped invalid group"); continue; }
    const gr = g as Record<string, unknown>;
    const name = typeof gr["name"] === "string" && gr["name"].trim() ? gr["name"].trim().slice(0, 80) : null;
    if (!name) { errors.push("skipped unnamed group"); continue; }
    if (groups.some((x) => x.name === name)) { errors.push(`skipped duplicate group "${name}"`); continue; }
    const entries: FavoriteEntry[] = [];
    const list = Array.isArray(gr["entries"]) ? gr["entries"] : [];
    for (const e of list) {
      const v = validateEntry(e);
      if (!v) { errors.push(`skipped invalid entry in "${name}"`); continue; }
      entries.push(v);
    }
    groups.push({ name, entries });
  }
  if (groups.length === 0) return { doc: emptyFavoritesDoc(), errors };
  return { doc: { version: 1, groups }, errors };
}

export function serializeFavoritesDoc(doc: FavoritesDoc): string {
  return stringifyYaml({ version: 1, groups: doc.groups.map((g) => ({ name: g.name, entries: g.entries })) });
}

export function addGroup(doc: FavoritesDoc, name: string): FavoritesDoc {
  const n = name.trim().slice(0, 80);
  if (!n || doc.groups.some((g) => g.name === n)) return doc;
  return { ...doc, groups: [...doc.groups, { name: n, entries: [] }] };
}

export function renameGroup(doc: FavoritesDoc, oldName: string, newName: string): FavoritesDoc {
  const n = newName.trim().slice(0, 80);
  if (!n || doc.groups.some((g) => g.name === n)) return doc;
  return { ...doc, groups: doc.groups.map((g) => (g.name === oldName ? { ...g, name: n } : g)) };
}

export function deleteGroup(doc: FavoritesDoc, name: string): FavoritesDoc {
  if (doc.groups.length <= 1) return doc;
  return { ...doc, groups: doc.groups.filter((g) => g.name !== name) };
}

export function addEntry(doc: FavoritesDoc, group: string, entry: FavoriteEntry): FavoritesDoc {
  if (!validateEntry(entry)) return doc;
  return {
    ...doc,
    groups: doc.groups.map((g) =>
      g.name === group && !g.entries.some((e) => e.type === entry.type && e.target === entry.target)
        ? { ...g, entries: [...g.entries, entry] }
        : g,
    ),
  };
}

export function removeEntry(doc: FavoritesDoc, group: string, index: number): FavoritesDoc {
  return { ...doc, groups: doc.groups.map((g) => (g.name === group ? { ...g, entries: g.entries.filter((_, i) => i !== index) } : g)) };
}

export function moveEntry(doc: FavoritesDoc, group: string, from: number, to: number): FavoritesDoc {
  return {
    ...doc,
    groups: doc.groups.map((g) => {
      if (g.name !== group || from < 0 || to < 0 || from >= g.entries.length || to >= g.entries.length) return g;
      const entries = [...g.entries];
      const [moved] = entries.splice(from, 1);
      entries.splice(to, 0, moved!);
      return { ...g, entries };
    }),
  };
}

export function setEntryAlias(doc: FavoritesDoc, group: string, index: number, alias: string | null): FavoritesDoc {
  return {
    ...doc,
    groups: doc.groups.map((g) =>
      g.name === group
        ? { ...g, entries: g.entries.map((e, i) => (i === index ? { ...e, ...(alias?.trim() ? { alias: alias.trim().slice(0, 120) } : { alias: undefined }) } : e)) }
        : g,
    ),
  };
}

/** Split a heading/block target into file rel + fragment. */
export function splitAnchorTarget(target: string): { rel: string; frag: string } | null {
  const hash = target.lastIndexOf("#");
  if (hash < 0) return null;
  return { rel: target.slice(0, hash), frag: target.slice(hash + 1) };
}
