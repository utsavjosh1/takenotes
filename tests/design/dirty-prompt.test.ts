import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function rendererSource(...parts: string[]): string {
  return readFileSync(join(__dirname, "..", "..", "apps", "desktop", "src", "renderer", ...parts), "utf8");
}

/**
 * TN-DESIGN-002b post-fix: single dirty close and delete-with-dirty prompt
 * Save/Discard/Cancel. Bulk-close, quit, and crash stay silent-preserve.
 */
describe("TN-DESIGN-002b dirty prompt (Save/Discard/Cancel)", () => {
  const app = rendererSource("App.tsx");

  it("single dirty close prompts instead of silent close", () => {
    expect(app).toContain("requestCloseTab");
    expect(app).toContain("dirtyPrompt");
    expect(app).toContain("Unsaved changes");
    // Three explicit choices, Cancel aborts (onClose dismisses, no close call).
    expect(app).toContain("confirmDirtySave");
    expect(app).toContain("confirmDirtyDiscard");
    // Two buttons only: Discard (left) vs Save (right, primary). Abort lives
    // on the dialog X / Escape, not a third button.
    expect(app).toContain("dirty-prompt-actions");
    expect(app).not.toContain(">Cancel<");
    expect(app).toContain(">Discard changes<");
    expect(app).toContain(">Save<");
  });

  it("dialog contract: one primary (Save), destructive never default, safe initial focus", () => {
    expect(app).toContain('variant="primary"');
    expect(app).toContain('variant="destructive"');
    expect(app).toContain("initialFocus={dirtySaveRef}");
    // Backdrop must not dismiss a destructive decision (explicit choice only).
    expect(app).not.toContain("closeOnBackdrop");
  });

  it("Save preserves (save then close/delete); Discard drops without flush", () => {
    expect(app).toContain("await docsApi.save(p.key)");
    expect(app).toContain("docsApi.discardDraft(p.key)");
    expect(app).toContain("docsApi.closeTabWithoutPreserve(p.key)");
  });

  it("delete-with-dirty prompts; clean delete stays direct", () => {
    expect(app).toContain("requestRemoveEntry");
    expect(app).toContain("dirty.length === 0");
    expect(app).toContain("void treeApi.removeEntry(entry)");
  });

  it("bulk-close stays silent-preserve (no per-tab prompt)", () => {
    const menus = rendererSource("components", "menus.ts");
    expect(menus).toContain("closeTabSilent");
    expect(menus).toContain("Bulk close stays silent: prompting per tab would be hostile.");
    const commands = rendererSource("hooks", "use-commands.ts");
    // Only the single active-tab command prompts; bulk loops use silent.
    expect(commands).toContain("deps.requestCloseTab ?? docs.closeTab");
  });

  it("quit/crash safety net untouched (beforeunload flushes every dirty doc)", () => {
    const docs = rendererSource("hooks", "use-documents.ts");
    expect(docs).toContain("beforeunload");
    expect(docs).toContain('reason: "shutdown"');
    expect(docs).toContain("closeTabWithoutPreserve");
  });
});
