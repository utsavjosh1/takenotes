/**
 * M1 gate — read + navigate (runs on any OS, no native deps).
 *
 * Every vector exercises the mobile seam while asserting desktop-identical
 * semantics (locality): sort rules, fuzzy tiers, grammar, favorites
 * round-trip, outline parse, index bounds, status copy. A drift in core
 * fails here first — that is the point.
 */
import { describe, expect, it } from "vitest";
import { WorkspaceIndex } from "@takenotes/core/index/store";
import { revisionOfBytes } from "@takenotes/core/policy/note-policy";
import { FAVORITES_REL } from "@takenotes/core/favorites/store";
import { MobileWorkspace } from "@takenotes/mobile/workspace/mobile-workspace";
import { MemoryHostFilesystem } from "@takenotes/mobile/adapters/memory";
import { listExplorerEntries } from "@takenotes/mobile/browse/explorer";
import { quickOpen, quickOpenCreateTarget } from "@takenotes/mobile/browse/quick-open";
import { searchWorkspace } from "@takenotes/mobile/browse/search";
import { readFavorites } from "@takenotes/mobile/browse/favorites";
import { getOutline, getPreview } from "@takenotes/mobile/browse/outline";
import {
  MAX_LISTED_FILES,
  buildMobileIndex,
  mobileIndexStatusMessage,
  syncMobileFileIndex,
} from "@takenotes/mobile/index/mobile-index";
import { resolveTheme, targetSize } from "@takenotes/ui/native";

const ROOT = "/sandbox/takenotes";

function makeWs() {
  const host = new MemoryHostFilesystem();
  const ws = new MobileWorkspace({ workspaceId: "m1-ws", root: ROOT }, host);
  return { host, ws };
}

function rev(content: string) {
  return revisionOfBytes(Buffer.from(content, "utf8"), 1);
}

function seedIndex(store: WorkspaceIndex, files: Record<string, string>, wid = "m1-ws") {
  for (const [rel, content] of Object.entries(files)) {
    store.upsert(wid, rel, content, rev(content));
  }
}

describe("M1: explorer listing", () => {
  it("lists root folders-first, name-asc default", async () => {
    const { host } = makeWs();
    host.seed(`${ROOT}/b.md`, "b");
    host.seed(`${ROOT}/a.md`, "a");
    host.seed(`${ROOT}/Zoo/note.md`, "n");
    host.seed(`${ROOT}/apple/note.md`, "n");
    const rows = await listExplorerEntries(host, ROOT, "", { key: "name", dir: "asc" });
    expect(rows.map((r) => r.relativePath)).toEqual(["apple", "Zoo", "a.md", "b.md"]);
    expect(rows[0]).toMatchObject({ kind: "directory" });
    expect(rows[2]).toMatchObject({ kind: "file" });
  });

  it("lists subdirectories; modified ordering comes from core sort", async () => {
    const { host } = makeWs();
    host.seed(`${ROOT}/docs/old.md`, "old");
    host.seed(`${ROOT}/docs/new.md`, "new");
    const rows = await listExplorerEntries(host, ROOT, "docs", { key: "name", dir: "asc" });
    expect(rows.map((r) => r.name)).toEqual(["new.md", "old.md"]);
    // Ordering semantics are core's (single source of truth):
    const { sortEntries } = await import("@takenotes/core/explorer/sort");
    const ordered = sortEntries(
      [
        { name: "a.md", relativePath: "a.md", kind: "file", mtimeMs: 2 },
        { name: "b.md", relativePath: "b.md", kind: "file", mtimeMs: 1 },
      ],
      { key: "modified", dir: "desc" },
    );
    expect(ordered.map((e) => e.name)).toEqual(["a.md", "b.md"]);
  });
});

describe("M1: quick open", () => {
  const files = {
    "Projects/Alpha.md": "# Alpha\n",
    "daily/2026-10-08.md": "# today\n",
    "README.md": "# readme\n",
  };

  it("fuzzy-matches by name with exact first", () => {
    const store = new WorkspaceIndex();
    seedIndex(store, files);
    const hits = quickOpen(store, "m1-ws", "alpha");
    expect(hits[0]?.relativePath).toBe("Projects/Alpha.md");
    expect(quickOpen(store, "m1-ws", "zzz")).toEqual([]);
  });

  it("empty query returns recents only (never a dump)", () => {
    const store = new WorkspaceIndex();
    seedIndex(store, files);
    const hits = quickOpen(store, "m1-ws", "", ["README.md", "missing.md"]);
    expect(hits.map((h) => h.relativePath)).toEqual(["README.md"]);
    expect(quickOpen(store, "m1-ws", "")).toEqual([]);
  });

  it("create target mirrors desktop rules", () => {
    expect(quickOpenCreateTarget("ideas/note", "")).toEqual({ ok: true, rel: "ideas/note.md" });
    expect(quickOpenCreateTarget("../escape", "").ok).toBe(false);
    expect(quickOpenCreateTarget("", "").ok).toBe(false);
  });
});

describe("M1: search (desktop-identical grammar)", () => {
  const files = {
    "a.md": "# shopping\nbuy milk\n",
    "b.md": "# work\n\"buy milk\" and eggs\n",
    "c.md": "# notes\nnothing relevant\n",
  };

  it("word AND, exact phrase, OR, negation", () => {
    const store = new WorkspaceIndex();
    seedIndex(store, files);
    const and = searchWorkspace(store, "m1-ws", "buy milk");
    if (!("result" in and)) throw new Error("expected result");
    // AND: a.md (buy+milk) and b.md (phrase contains both) match; c.md doesn't.
    expect(and.result.content.map((m) => m.relativePath).sort()).toEqual(["a.md", "b.md"]);
    const phrase = searchWorkspace(store, "m1-ws", '"buy milk"');
    if (!("result" in phrase)) throw new Error("expected result");
    expect(phrase.result.content.map((m) => m.relativePath).sort()).toEqual(["a.md", "b.md"]);
    const or = searchWorkspace(store, "m1-ws", "shopping OR eggs");
    if (!("result" in or)) throw new Error("expected result");
    expect(or.result.content.map((m) => m.relativePath).sort()).toEqual(["a.md", "b.md"]);
    const neg = searchWorkspace(store, "m1-ws", "milk -shopping");
    if (!("result" in neg)) throw new Error("expected result");
    expect(neg.result.content.map((m) => m.relativePath)).toEqual(["b.md"]);
  });

  it("file: scoping + empty query matches nothing", () => {
    const store = new WorkspaceIndex();
    seedIndex(store, files);
    const scoped = searchWorkspace(store, "m1-ws", "file:b milk");
    if (!("result" in scoped)) throw new Error("expected result");
    expect(scoped.result.content.map((m) => m.relativePath)).toEqual(["b.md"]);
    const empty = searchWorkspace(store, "m1-ws", "   ");
    if (!("result" in empty)) throw new Error("expected result");
    expect(empty.result).toEqual({ filenames: [], content: [] });
  });

  it("unsupported operators are INVALID_REQUEST naming operator+position", () => {
    const store = new WorkspaceIndex();
    seedIndex(store, files);
    for (const [raw, operator, position] of [
      ["link:note", "link:note", 0],
      ["foo:bar", "foo:bar", 0],
      ["a foo:bar", "foo:bar", 2],
    ] as const) {
      const out = searchWorkspace(store, "m1-ws", raw);
      expect("error" in out, raw).toBe(true);
      if ("error" in out) {
        expect(out.error.code).toBe("INVALID_REQUEST");
        expect(out.error).toMatchObject({ operator, position });
      }
    }
  });
});

describe("M1: favorites read", () => {
  it("parses traveling yaml; missing file → empty doc", async () => {
    const { host, ws } = makeWs();
    host.seed(
      `${ROOT}/${FAVORITES_REL}`,
      "version: 1\ngroups:\n  - name: default\n    entries:\n      - { type: file, target: a.md }\n      - { type: search, target: 'tag:work' }\n",
    );
    const out = await readFavorites(ws);
    expect("doc" in out).toBe(true);
    if ("doc" in out) {
      expect(out.errors).toEqual([]);
      expect(out.doc.groups[0]?.entries).toHaveLength(2);
    }
    const missing = await readFavorites(new MobileWorkspace({ workspaceId: "empty", root: "/void" }, new MemoryHostFilesystem()));
    expect("doc" in missing).toBe(true);
  });

  it("invalid yaml → empty doc + errors, file untouched", async () => {
    const { host, ws } = makeWs();
    const bad = "groups: [unclosed\n";
    host.seed(`${ROOT}/${FAVORITES_REL}`, bad);
    const out = await readFavorites(ws);
    expect("doc" in out).toBe(true);
    if ("doc" in out) expect(out.errors.length).toBeGreaterThan(0);
    const reread = await ws.read(FAVORITES_REL);
    if ("result" in reread) expect(reread.result.content).toBe(bad);
  });
});

describe("M1: outline + preview", () => {
  it("extracts ATX headings incl. CRLF/BOM, skips fenced code", async () => {
    const { host, ws } = makeWs();
    host.seed(
      `${ROOT}/note.md`,
      "﻿# Title\r\ntext\r\n```\r\n# not a heading\r\n```\r\n## Real\r\n",
    );
    const out = await getOutline(ws, "note.md");
    expect("headings" in out).toBe(true);
    if ("headings" in out) {
      expect(out.headings.map((h) => h.text)).toEqual(["Title", "Real"]);
      expect(out.headings[0]).toMatchObject({ level: 1, line: 1 });
    }
  });

  it("preview returns excerpt + full rel for disambiguation", async () => {
    const { host, ws } = makeWs();
    host.seed(`${ROOT}/Projects/Alpha.md`, "# Alpha\nline2\nline3\n");
    const out = await getPreview(ws, "Projects/Alpha.md");
    expect(out).toMatchObject({ relativePath: "Projects/Alpha.md" });
    if (!("error" in out)) expect(out.excerpt).toContain("Alpha");
    await expect(getPreview(ws, "missing.md")).resolves.toMatchObject({ error: { code: "NOT_FOUND" } });
  });
});

describe("M1: mobile index build", () => {
  it("indexes md, skips non-md/.git/canvas/oversize, counts skipped", async () => {
    const { host, ws } = makeWs();
    host.seed(`${ROOT}/a.md`, "# a\n");
    host.seed(`${ROOT}/sub/b.md`, "# b\n");
    host.seed(`${ROOT}/img.png`, "binary");
    host.seed(`${ROOT}/.git/config`, "git");
    host.seed(`${ROOT}/board.canvas`, "{}");
    host.seed(`${ROOT}/big.md`, "x".repeat(1024 * 1024 + 1));
    const store = new WorkspaceIndex();
    const res = await buildMobileIndex({ lister: host, reader: ws }, store, "m1-ws", ROOT);
    expect(res).toMatchObject({ ok: true, indexed: 2, skipped: 1, truncated: false });
    expect(store.list("m1-ws").map((e) => e.relativePath).sort()).toEqual(["a.md", "sub/b.md"]);
  });

  it("caps at 2000 files with truncated notice", async () => {
    const { host, ws } = makeWs();
    for (let i = 0; i < 2005; i++) host.seed(`${ROOT}/f${i}.md`, `# f${i}\n`);
    const store = new WorkspaceIndex();
    const res = await buildMobileIndex({ lister: host, reader: ws }, store, "m1-ws", ROOT);
    expect(res).toMatchObject({ ok: true, truncated: true });
    if (res.ok) {
      expect(res.indexed).toBeLessThanOrEqual(MAX_LISTED_FILES);
      expect(mobileIndexStatusMessage(res)).toContain("Partial index");
    }
  }, 30000);

  it("root-list failure is honest, never partial-as-complete", async () => {
    const { ws } = makeWs();
    const failing = {
      listDirectory: async () => {
        throw new Error("disk gone");
      },
      ensureDirectory: async () => {},
    };
    const res = await buildMobileIndex({ lister: failing, reader: ws }, new WorkspaceIndex(), "m1-ws", ROOT);
    expect(res.ok).toBe(false);
  });

  it("status copy mirrors desktop vectors", () => {
    expect(mobileIndexStatusMessage({ indexed: 3, skipped: 0, truncated: false })).toBeNull();
    expect(mobileIndexStatusMessage({ indexed: 2000, skipped: 0, truncated: true })).toContain("over 2000 files");
    expect(mobileIndexStatusMessage({ indexed: 3, skipped: 2, truncated: false })).toContain("2 files skipped");
    expect(mobileIndexStatusMessage({ indexed: 1, skipped: 1, truncated: false })).toContain("1 file skipped");
  });

  it("canvas files drop instead of indexing", () => {
    const store = new WorkspaceIndex();
    seedIndex(store, { "b.canvas": "{}" });
    syncMobileFileIndex(store, "m1-ws", "b.canvas", "{}", rev("{}"));
    expect(store.get("m1-ws", "b.canvas")).toBeUndefined();
  });
});

describe("M1: ui/native contracts (no DOM, touch-sized)", () => {
  it("imports in node env and resolves touch targets", () => {
    expect(targetSize.touch).toBeGreaterThanOrEqual(44);
    expect(resolveTheme("dark", "light")).toBe("dark");
    expect(resolveTheme("system", "dark")).toBe("dark");
  });
});
