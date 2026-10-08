import { describe, expect, it } from "vitest";
import {
  addCollectionView,
  collectionFileName,
  emptyCollectionDoc,
  parseCollectionDoc,
  removeCollectionView,
  renameCollectionView,
  serializeCollectionDoc,
} from "@takenotes/core/collections/store";
import { cellDisplay, evaluateCollectionView } from "@takenotes/core/collections/evaluate";
import { parseDocument } from "@takenotes/core/index/document";

/** Phase 3 Collections gate — doc vectors + evaluation vectors. */

function entry(rel: string, content: string, mtimeMs = 0) {
  return parseDocument("ws", rel, content, { hash: `h-${rel}`, mtimeMs, size: content.length });
}

const alpha = entry("alpha.md", "---\nstatus: active\npriority: 2\n---\n# Alpha\nship it\n");
const beta = entry("beta.md", "---\nstatus: done\npriority: 10\n---\n# Beta\n retrospective\n");
const gamma = entry("gamma.md", "# Gamma\nno frontmatter here\n");

describe("parseCollectionDoc", () => {
  it("round-trips yaml and drops invalid views without losing good ones", () => {
    const { doc, errors } = parseCollectionDoc(
      `
version: 1
name: Projects
query: "[status:active]"
views:
  - {name: Table, kind: table, columns: [status, priority]}
  - {name: Cards, kind: cards}
  - {name: Table, kind: list}
  - {name: "", kind: list}
`,
      "Projects",
    );
    expect(doc.name).toBe("Projects");
    expect(doc.views).toEqual([{ name: "Table", kind: "table", columns: ["status", "priority"] }]);
    expect(errors.length).toBeGreaterThan(0);
    expect(parseCollectionDoc(serializeCollectionDoc(doc), "Projects").doc).toEqual(doc);
  });

  it("repairs missing names, queries, and views with reported errors", () => {
    const { doc, errors } = parseCollectionDoc("version: 1\n", "fallback");
    expect(doc.name).toBe("fallback");
    expect(doc.query).toBe("");
    expect(doc.views).toEqual([{ name: "Table", kind: "table" }]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects bad sorts, bad columns, and invalid yaml", () => {
    const { doc, errors } = parseCollectionDoc(
      "name: X\nquery: q\nviews:\n  - {name: V, kind: table, columns: [ok, 'has space'], sort: {key: nope, dir: asc}}\n",
      "X",
    );
    expect(doc.views).toEqual([{ name: "Table", kind: "table" }]);
    expect(errors.length).toBeGreaterThan(0);
    expect(parseCollectionDoc("{{{{", "X").errors.length).toBeGreaterThan(0);
    expect(parseCollectionDoc("a".repeat(3000), "X").errors.length).toBeGreaterThan(0);
  });

  it("validates filenames and view mutations", () => {
    expect(collectionFileName("My View")).toBe("My View.yaml");
    expect(collectionFileName("../escape")).toBeNull();
    expect(collectionFileName("")).toBeNull();
    const doc = emptyCollectionDoc("C");
    const added = addCollectionView(doc, { name: "List", kind: "list", sort: { key: "property", dir: "desc", property: "priority" } });
    expect(added.views.map((v) => v.name)).toEqual(["Table", "List"]);
    expect(addCollectionView(added, { name: "List", kind: "list" })).toBe(added);
    expect(addCollectionView(added, { name: "X", kind: "cards" } as never)).toBe(added);
    expect(renameCollectionView(added, "List", "All").views.map((v) => v.name)).toEqual(["Table", "All"]);
    expect(removeCollectionView(added, "List").views.map((v) => v.name)).toEqual(["Table"]);
    expect(removeCollectionView(doc, "Table")).toBe(doc);
  });
});

describe("evaluateCollectionView", () => {
  const entries = [alpha, beta, gamma];

  it("filters by the search grammar and projects columns", () => {
    const res = evaluateCollectionView(entries, {
      version: 1,
      name: "Active",
      query: "[status:active]",
      views: [{ name: "Table", kind: "table", columns: ["status", "priority"] }],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.rows.map((r) => r.relativePath)).toEqual(["alpha.md"]);
    expect(res.rows[0]!.cells).toEqual({ status: "active", priority: "2" });
    expect(res.rows[0]!.title).toBe("Alpha");
  });

  it("tag queries filter; default columns union frontmatter keys", () => {
    const tagged = entry("t.md", "#t\n#ship #ship\n");
    const res = evaluateCollectionView([...entries, tagged], {
      version: 1,
      name: "T",
      query: "tag:ship",
      views: [{ name: "List", kind: "list" }],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.rows.map((r) => r.relativePath)).toEqual(["t.md"]);
    expect(res.rows[0]!.cells).toEqual({});
  });

  it("sorts by property numerically with missing last", () => {
    const res = evaluateCollectionView(entries, {
      version: 1,
      name: "P",
      query: "type:project OR alpha OR beta OR gamma",
      views: [{ name: "T", kind: "table", sort: { key: "property", dir: "desc", property: "priority" } }],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    // beta(10) > alpha(2) > gamma(missing, last).
    expect(res.rows.map((r) => r.relativePath)).toEqual(["beta.md", "alpha.md", "gamma.md"]);
  });

  it("empty queries match nothing; bad queries and views error honestly", () => {
    const doc = { version: 1 as const, name: "E", query: "", views: [{ name: "T", kind: "table" as const }] };
    expect(evaluateCollectionView(entries, doc)).toEqual({ ok: true, rows: [], truncated: false });
    expect(evaluateCollectionView(entries, { ...doc, query: "foo:bar" }).ok).toBe(false);
    expect(evaluateCollectionView(entries, doc, "Nope").ok).toBe(false);
  });

  it("cellDisplay stringifies scalars, lists, and objects", () => {
    expect(cellDisplay(" a ")).toBe("a");
    expect(cellDisplay(["x", "y"])).toBe("x, y");
    expect(cellDisplay(null)).toBe("");
    expect(cellDisplay({ a: 1 })).toBe('{"a":1}');
  });
});
