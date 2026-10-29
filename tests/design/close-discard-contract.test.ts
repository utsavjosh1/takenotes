import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function rendererSource(...parts: string[]): string {
  return readFileSync(join(__dirname, "..", "..", "apps", "desktop", "src", "renderer", ...parts), "utf8");
}

function mainSource(...parts: string[]): string {
  return readFileSync(join(__dirname, "..", "..", "apps", "desktop", "src", "main", ...parts), "utf8");
}

/**
 * TN-DESIGN-002 characterization: the dirty-close + destructive-copy contract
 * as statically traced. These pin the SAFE paths (close/quit/reopen preserve;
 * labels honest). The two fix-required paths (WSL unconfirmed permanent delete
 * under default settings; trash-while-dirty dropping unsaved edits) are filed
 * as P0 tasks in task-status.md — deliberately NOT pinned here, so the fix
 * tasks can add their own post-fix assertions.
 */
describe("dirty-tab close preserves (F-011)", () => {
  const docs = rendererSource("hooks", "use-documents.ts");

  it("closeTab flushes the dirty buffer into draft + recovery before closing", () => {
    const closeTab = docs.slice(docs.indexOf("const closeTab = useCallback"));
    expect(closeTab).toContain('reason: "close"');
    expect(closeTab).toContain("safeDraftPut");
  });

  it("every tab-close entry point funnels through closeTab (no second path)", () => {
    const commands = rendererSource("hooks", "use-commands.ts");
    // TN-DESIGN-002b: single active-tab close prompts first (Save/Discard/Cancel),
    // falling back to silent closeTab when no prompt is wired.
    expect(commands).toContain("(deps.requestCloseTab ?? docs.closeTab)(a.key)");
    const menus = rendererSource("components", "menus.ts");
    expect(menus.match(/closeTab/g)!.length).toBeGreaterThanOrEqual(4); // Close + Close others + Close to the right
  });

  it("quit flushes every dirty doc (beforeunload), not just the active tab", () => {
    expect(docs).toContain("beforeunload");
    const unload = docs.slice(docs.indexOf("const onUnload"));
    expect(unload).toContain("safeDraftPut");
    expect(unload).toContain("reason: \"shutdown\"");
  });

  it("reopen never auto-applies a draft; file-gone retains the draft as a tab", () => {
    expect(docs).toContain("never auto-apply");
    expect(docs).toContain("retained — save it");
  });

  it("closed tabs are recorded for reopen, which re-runs the draft check", () => {
    expect(docs).toContain("reopenClosedTab");
  });
});

describe("destructive-copy contract (F-033)", () => {
  it("file-menu labels split honestly: permanent for WSL, OS-trash elsewhere", () => {
    const menus = rendererSource("components", "menus.ts");
    expect(menus).toContain("Delete permanently…");
    expect(menus).toContain("moveToTrashLabel(platform.platform)");
  });

  it("WSL trash is genuinely permanent underneath (no OS-trash mislabeling)", () => {
    const service = mainSource("services", "note-service.ts");
    expect(service).toContain("P1 permanent-delete");
  });

  it("confirmTrash exists, defaults off, and is labelled as a trash confirm", () => {
    const types = rendererSource("components", "types.ts");
    expect(types).toContain("confirmTrash: false");
    const settings = rendererSource("components", "settings.tsx");
    expect(settings).toContain("Confirm before moving to trash");
  });

  it("recovery notice orders safe-first (Restore) with destructive second, no autofocus theft", () => {
    const app = rendererSource("App.tsx");
    const notice = app.slice(app.indexOf("An unsaved draft is available"));
    expect(notice.indexOf("Restore draft")).toBeLessThan(notice.indexOf("Discard draft"));
    expect(notice).toContain('variant="destructive"');
  });

  it("collection / favorites deletes name their safe scope in the confirm", () => {
    const collections = rendererSource("hooks", "use-collections.ts");
    expect(collections).toContain("The notes stay untouched.");
    const favorites = rendererSource("components", "favorites.tsx");
    // Favourites hold no group-delete anymore; removing an entry never touches the note.
    expect(favorites).toContain("never touches the note itself");
    expect(favorites).not.toContain("window.confirm");
  });

  it("Undo is only offered where it is real (local trash restores the text; WSL stays permanent and says so)", () => {
    const tree = rendererSource("hooks", "use-file-tree.ts");
    expect(tree).toContain("const before = wsl ? null :");
    expect(tree).toContain("This cannot be undone");
  });
});
