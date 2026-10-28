import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Edge } from "@takenotes/core/index/edges";
import { renameImpact, renameSummary } from "@takenotes/core/save/rename-impact";
import { saveStateOf } from "@takenotes/core/save/decisions";
import { createLayout, markDeleted, markOffline, markReadOnly, markSaved, openDoc, updateDocContent, type DocState } from "@takenotes/desktop/renderer/panes";

const doc = (key: string): DocState => ({ key, relativePath: `${key}.md`, content: "a", dirty: false, revisionHash: "r1", newlineStyle: "lf", hadBom: false, conflict: false, loadError: null, saving: false, savedAt: "" });
const link = (from: string, to: string | null): Edge => ({ from, to, kind: "link" });
const src = (p: string) => readFileSync(resolve(__dirname, "../../apps/desktop/src/renderer", p), "utf8");

describe("rename preview", () => {
  const edges = [link("a.md", "t.md"), link("a.md", "t.md"), link("b.md", "t.md"), link("t.md", "t.md"), link("c.md", null), link("x/in.md", "dir/n.md"), link("dir/m.md", "dir/n.md")];
  it("counts links and the notes they come from, ignoring self links and unresolved ones", () => {
    expect(renameImpact(edges, "t.md", false)).toEqual({ links: 3, notes: 2 });
  });
  it("counts links into a folder from outside it", () => {
    expect(renameImpact(edges, "dir", true)).toEqual({ links: 1, notes: 1 });
  });
  it("says it in plain words", () => {
    expect(renameSummary({ links: 0, notes: 0 }, true)).toBe("No other notes link to it.");
    expect(renameSummary({ links: 1, notes: 1 }, true)).toBe("1 link in 1 note will be updated to the new name.");
    expect(renameSummary({ links: 3, notes: 2 }, false)).toContain("will stop working");
  });
});

describe("open note trust states", () => {
  it("a deleted note keeps its text and shows Deleted until it is saved again", () => {
    let l = openDoc(createLayout(), doc("n"));
    l = updateDocContent(l, "n", "my edits");
    l = markDeleted(l, "n");
    expect(l.docs.n).toMatchObject({ deleted: true, content: "my edits", dirty: true });
    expect(saveStateOf({ ...l.docs.n!, readOnly: false })).toBe("deleted");
    l = markSaved(l, "n", "r2", "now");
    expect(l.docs.n!.deleted).toBe(false);
  });
  it("read-only and offline notes keep their edits and clear when a save lands", () => {
    let l = updateDocContent(openDoc(createLayout(), doc("n")), "n", "x");
    l = markReadOnly(l, "n");
    expect(l.docs.n).toMatchObject({ readOnly: true, dirty: true, content: "x" });
    l = markOffline(markSaved(l, "n", "r3", "t"), "n", true);
    expect(saveStateOf({ dirty: true, saving: false, conflict: false, offline: l.docs.n!.offline })).toBe("disconnected");
    l = markOffline(l, "n", false);
    expect(l.docs.n!.offline).toBe(false);
  });
});

describe("trust layer is wired into the app", () => {
  const docs = src("hooks/use-documents.ts");
  it("uses the shared decision rules and writes the labelled snapshots", () => {
    expect(docs).toContain("decideExternalChange");
    expect(docs).toContain("classifySaveFailure");
    for (const r of ["before-overwrite", "before-reload"]) expect(docs).toContain(`reason: "${r}"`);
    expect(docs).toContain('toast("Updated from disk.")');
  });
  it("never autosaves a note that is deleted, read-only, offline or in conflict", () => {
    expect(docs).toMatch(/!d\.conflict && !d\.deleted && !d\.readOnly && !d\.offline/);
  });
  it("shows every banner and dialog", () => {
    const app = src("App.tsx");
    for (const c of ["ConflictBanner", "DeletedBanner", "ReadOnlyBanner", "DisconnectedBanner", "CompareDialog", "SaveFailureDialogView", "RenamePreviewDialog"]) expect(app).toContain(`<${c}`);
    const ui = src("components/trust-ui.tsx");
    for (const w of ["Save as new note", "Restore note", "Copy details", "Reconnect", "Copy to a new note", "Compare"]) expect(ui).toContain(w);
  });
  it("both rename paths ask first and the status bar uses the seven states", () => {
    expect(src("hooks/use-file-tree.ts")).toContain("askRename(");
    expect(docs).toContain("askRename(");
    expect(src("status.ts")).toContain("SAVE_STATES");
  });
});
