import { describe, expect, it } from "vitest";
import {
  activateDoc,
  activatePane,
  activeDoc,
  applyRename,
  closeDocInPane,
  closePane,
  createLayout,
  markConflict,
  markSaved,
  markSaving,
  openDocInPane,
  paneDocs,
  removeDocsForEntry,
  resolveDoc,
  splitPane,
  updateDocContent,
  type DocState,
} from "../../src/renderer/panes";

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

/** P1-06 tab/split state seam: pure logic, no React, runs anywhere. */
describe("pane layout", () => {
  it("opens first and second notes, switches active tab, preserves state", () => {
    let l = createLayout();
    l = openDocInPane(l, l.activePaneId, doc("a.md", "A"));
    l = openDocInPane(l, l.activePaneId, doc("b.md", "B"));
    expect(paneDocs(l, l.activePaneId).map((d) => d.relativePath)).toEqual(["a.md", "b.md"]);
    l = updateDocContent(l, "ws:a.md", "A-edited");
    l = activateDoc(l, l.activePaneId, "ws:b.md");
    expect(activeDoc(l)?.relativePath).toBe("b.md");
    // Switching away preserves a.md's dirty content.
    l = activateDoc(l, l.activePaneId, "ws:a.md");
    expect(activeDoc(l)).toMatchObject({ content: "A-edited", dirty: true });
  });

  it("closing a clean tab closes immediately; dirty docs are returned for draft flush", () => {
    let l = createLayout();
    l = openDocInPane(l, l.activePaneId, doc("a.md"));
    l = openDocInPane(l, l.activePaneId, doc("b.md", "B", { dirty: true }));
    const clean = closeDocInPane(l, l.activePaneId, "ws:a.md");
    expect(clean.closed).toMatchObject({ dirty: false });
    expect(paneDocs(clean.layout, clean.layout.activePaneId).map((d) => d.relativePath)).toEqual(["b.md"]);
    // Dirty docs are never silently discarded: the closed doc is handed back
    // so the caller can flush it to the existing draft store first.
    const dirty = closeDocInPane(clean.layout, clean.layout.activePaneId, "ws:b.md");
    expect(dirty.closed).toMatchObject({ relativePath: "b.md", dirty: true, content: "B" });
    expect(dirty.orphaned).toBe(true);
  });

  it("two panes share one doc: edit in one reflects dirty in the other", () => {
    let l = createLayout();
    l = openDocInPane(l, l.activePaneId, doc("same.md", "v1"));
    l = splitPane(l, l.activePaneId, "vertical");
    expect(l.panes).toHaveLength(2);
    const other = l.panes.find((p) => p.id !== l.activePaneId)!;
    // Same file open in both panes is ONE shared doc (single revision truth).
    l = openDocInPane(l, other.id, doc("same.md", "v1"));
    expect(Object.keys(l.docs)).toHaveLength(1);
    l = updateDocContent(l, "ws:same.md", "v2");
    for (const p of l.panes) {
      expect(paneDocs(l, p.id).find((d) => d.key === "ws:same.md")).toMatchObject({ dirty: true, content: "v2" });
    }
  });

  it("save in either pane cleans both with the new revision", () => {
    let l = createLayout();
    l = openDocInPane(l, l.activePaneId, doc("same.md", "v1"));
    l = splitPane(l, l.activePaneId, "vertical");
    const other = l.panes.find((p) => p.id !== l.activePaneId)!;
    l = openDocInPane(l, other.id, doc("same.md", "v1"));
    l = updateDocContent(l, "ws:same.md", "v2");
    l = markSaving(l, "ws:same.md", true);
    expect(activeDoc({ ...l, activePaneId: other.id })).toMatchObject({ saving: true });
    l = markSaved(l, "ws:same.md", "b".repeat(64), "12:00");
    for (const p of l.panes) {
      expect(paneDocs(l, p.id).find((d) => d.key === "ws:same.md")).toMatchObject({
        dirty: false,
        conflict: false,
        saving: false,
        revisionHash: "b".repeat(64),
      });
    }
  });

  it("conflict in one doc never poisons its neighbor", () => {
    let l = createLayout();
    l = openDocInPane(l, l.activePaneId, doc("a.md", "A", { dirty: true }));
    l = openDocInPane(l, l.activePaneId, doc("b.md", "B"));
    l = markConflict(l, "ws:a.md");
    expect(l.docs["ws:a.md"]).toMatchObject({ conflict: true, dirty: true, content: "A" });
    expect(l.docs["ws:b.md"]).toMatchObject({ conflict: false, dirty: false });
    l = resolveDoc(l, "ws:a.md", "A-disk\n", "c".repeat(64));
    expect(l.docs["ws:a.md"]).toMatchObject({ conflict: false, dirty: false, content: "A-disk\n" });
  });

  it("split caps at two panes; closing a split preserves the sibling", () => {
    let l = createLayout();
    l = openDocInPane(l, l.activePaneId, doc("a.md", "A"));
    l = splitPane(l, l.activePaneId, "horizontal");
    const second = l.panes.find((p) => p.id !== l.activePaneId)!;
    l = openDocInPane(l, second.id, doc("b.md", "B"));
    // A third split is refused: Phase 1 is a two-pane model, not an IDE tree.
    expect(splitPane(l, second.id, "vertical").panes).toHaveLength(2);
    l = activatePane(l, second.id);
    l = closePane(l, second.id);
    expect(l.panes).toHaveLength(1);
    // The surviving pane keeps its own doc; the closed pane's exclusive doc
    // is pruned.
    expect(paneDocs(l, l.activePaneId).map((d) => d.relativePath)).toEqual(["a.md"]);
    expect(l.docs["ws:b.md"]).toBeUndefined();
  });

  it("closing the last pane is refused", () => {
    const l = createLayout();
    expect(closePane(l, l.activePaneId).panes).toHaveLength(1);
  });

  it("rename remaps keys without resetting baselines", () => {
    let l = createLayout();
    l = openDocInPane(l, l.activePaneId, doc("old.md", "A", { revisionHash: "r1", dirty: true }));
    l = applyRename(l, "ws", "old.md", "new.md");
    expect(l.docs["ws:old.md"]).toBeUndefined();
    expect(l.docs["ws:new.md"]).toMatchObject({ relativePath: "new.md", content: "A", revisionHash: "r1", dirty: true });
    expect(l.panes[0]!.activeKey).toBe("ws:new.md");
  });

  it("delete/trash drops affected docs (file + folder prefix)", () => {
    let l = createLayout();
    l = openDocInPane(l, l.activePaneId, doc("gone.md"));
    l = openDocInPane(l, l.activePaneId, doc("dir/keep.md"));
    l = openDocInPane(l, l.activePaneId, doc("dir/sub/deep.md"));
    l = removeDocsForEntry(l, "ws", "gone.md");
    expect(l.docs["ws:gone.md"]).toBeUndefined();
    l = removeDocsForEntry(l, "ws", "dir");
    expect(Object.keys(l.docs)).toHaveLength(0);
    expect(l.panes[0]!.openKeys).toHaveLength(0);
  });
});
