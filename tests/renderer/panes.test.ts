import { describe, expect, it } from "vitest";
import {
  activateDoc,
  activateTabByIndex,
  activeDoc,
  applyRename,
  closeDoc,
  createLayout,
  markConflict,
  markSaved,
  markSaving,
  openDoc,
  popClosedTab,
  removeDocsForEntry,
  reorderTabs,
  resolveDoc,
  tabDocs,
  togglePinned,
  updateDocContent,
  type DocState,
} from "@takenotes/desktop/renderer/panes";

function doc(relativePath: string, content = "x\n", extra?: Partial<DocState>): DocState {
  return {
    key: `ws:${relativePath}`,
    relativePath,
    content,
    dirty: false,
    revisionHash: "a".repeat(64),
    newlineStyle: "lf",
    hadBom: false,
    conflict: false,
    loadError: null,
    saving: false,
    savedAt: "",
    ...extra,
  };
}

/** Roadmap Step 1: one editor tab strip; no split panes/stacked panes/pop-outs. */
describe("single tab layout", () => {
  it("opens first and second notes, switches active tab, preserves state", () => {
    let l = createLayout();
    l = openDoc(l, doc("a.md", "A"));
    l = openDoc(l, doc("b.md", "B"));
    expect(tabDocs(l).map((d) => d.relativePath)).toEqual(["a.md", "b.md"]);
    l = updateDocContent(l, "ws:a.md", "A-edited");
    l = activateDoc(l, "ws:b.md");
    expect(activeDoc(l)?.relativePath).toBe("b.md");
    l = activateDoc(l, "ws:a.md");
    expect(activeDoc(l)).toMatchObject({ content: "A-edited", dirty: true });
  });

  it("closing a clean or dirty tab records reopen history and returns the closed doc", () => {
    let l = createLayout();
    l = openDoc(l, doc("a.md"));
    l = openDoc(l, doc("b.md", "B", { dirty: true }));
    const clean = closeDoc(l, "ws:a.md");
    expect(clean.closed).toMatchObject({ dirty: false });
    expect(tabDocs(clean.layout).map((d) => d.relativePath)).toEqual(["b.md"]);
    const dirty = closeDoc(clean.layout, "ws:b.md");
    expect(dirty.closed).toMatchObject({ relativePath: "b.md", dirty: true, content: "B" });
    expect(dirty.orphaned).toBe(true);
    expect(dirty.layout.closedTabs).toEqual(["b.md", "a.md"]);
  });

  it("reopens the most recently closed tab path", () => {
    let l = createLayout();
    l = closeDoc(openDoc(l, doc("a.md")), "ws:a.md").layout;
    const popped = popClosedTab(l);
    expect(popped.relativePath).toBe("a.md");
    expect(popped.layout.closedTabs).toEqual([]);
  });

  it("pins tabs without changing dirty/revision state", () => {
    let l = openDoc(createLayout(), doc("a.md", "A", { dirty: true }));
    l = togglePinned(l, "ws:a.md");
    expect(l.docs["ws:a.md"]).toMatchObject({ pinned: true, dirty: true, revisionHash: "a".repeat(64) });
    l = togglePinned(l, "ws:a.md");
    expect(l.docs["ws:a.md"]?.pinned).toBe(false);
  });

  it("numbered activation and drag reorder stay in the single strip", () => {
    let l = createLayout();
    l = openDoc(l, doc("a.md"));
    l = openDoc(l, doc("b.md"));
    l = openDoc(l, doc("c.md"));
    l = activateTabByIndex(l, 0);
    expect(activeDoc(l)?.relativePath).toBe("a.md");
    l = reorderTabs(l, "ws:a.md", "ws:c.md");
    expect(tabDocs(l).map((d) => d.relativePath)).toEqual(["b.md", "c.md", "a.md"]);
  });

  it("save/conflict state remains per tab", () => {
    let l = createLayout();
    l = openDoc(l, doc("a.md", "A", { dirty: true }));
    l = openDoc(l, doc("b.md", "B"));
    l = markConflict(l, "ws:a.md");
    expect(l.docs["ws:a.md"]).toMatchObject({ conflict: true, dirty: true, content: "A" });
    expect(l.docs["ws:b.md"]).toMatchObject({ conflict: false, dirty: false });
    l = markSaving(l, "ws:a.md", true);
    l = markSaved(l, "ws:a.md", "b".repeat(64), "12:00");
    expect(l.docs["ws:a.md"]).toMatchObject({ dirty: false, conflict: false, saving: false, revisionHash: "b".repeat(64) });
    l = resolveDoc(l, "ws:a.md", "A-disk\n", "c".repeat(64));
    expect(l.docs["ws:a.md"]).toMatchObject({ conflict: false, dirty: false, content: "A-disk\n" });
  });

  it("rename remaps keys without resetting baselines", () => {
    let l = createLayout();
    l = openDoc(l, doc("old.md", "A", { revisionHash: "r1", dirty: true }));
    l = applyRename(l, "ws", "old.md", "new.md");
    expect(l.docs["ws:old.md"]).toBeUndefined();
    expect(l.docs["ws:new.md"]).toMatchObject({ relativePath: "new.md", content: "A", revisionHash: "r1", dirty: true });
    expect(l.activeKey).toBe("ws:new.md");
  });

  it("delete/trash drops affected docs (file + folder prefix)", () => {
    let l = createLayout();
    l = openDoc(l, doc("gone.md"));
    l = openDoc(l, doc("dir/keep.md"));
    l = openDoc(l, doc("dir/sub/deep.md"));
    l = removeDocsForEntry(l, "ws", "gone.md");
    expect(l.docs["ws:gone.md"]).toBeUndefined();
    l = removeDocsForEntry(l, "ws", "dir");
    expect(Object.keys(l.docs)).toHaveLength(0);
    expect(l.openKeys).toHaveLength(0);
  });
});
