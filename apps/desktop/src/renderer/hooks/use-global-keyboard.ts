import { useEffect } from "react";
import type { CommandId } from "@takenotes/core/commands/registry";
import { commandForKeyEventWithOverrides, type HotkeyOverrides } from "@takenotes/platform";
import type { PlatformState } from "./use-platform";
import type { DocumentsApi } from "./use-documents";
import type { FileTreeApi } from "./use-file-tree";

export type GlobalKeyboardDeps = {
  paletteOpen: boolean;
  platform: PlatformState;
  tree: FileTreeApi;
  docs: DocumentsApi;
  executeCommand: (id: CommandId) => void;
  hotkeyOverrides?: HotkeyOverrides;
};

/** App-wide keyboard shortcuts. Reads domain state, dispatches commands —
 * holds no state itself. Re-subscribes when its inputs change (same as the
 * inline version it replaces). */
export function useGlobalKeyboard(deps: GlobalKeyboardDeps): void {
  const { paletteOpen, platform, tree, docs, executeCommand, hotkeyOverrides } = deps;
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // IME composition owns the keyboard (§49, §154): never fire commands
      // while composing (CJK/Indic), and never steal dead-key sequences.
      if (e.isComposing || e.key === "Process") return;
      const mod = e.ctrlKey || e.metaKey;
      const inField = (t: EventTarget | null): boolean => {
        const el = t as HTMLElement | null;
        return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      };
      // Modal owns the keyboard while open (§54): palette capture-handlers
      // deal with Arrows/Enter/Escape; app shortcuts stay out of the way.
      // Save still works so a quick-open detour never blocks persisting.
      const keyCommand = commandForKeyEventWithOverrides(platform.platform, e, hotkeyOverrides ?? {});
      if (paletteOpen) {
        if (keyCommand === "editor.save") { e.preventDefault(); executeCommand("editor.save"); }
        return;
      }
      if (keyCommand && (
        keyCommand === "editor.save" ||
        keyCommand === "palette.open" ||
        keyCommand === "quickOpen.open" ||
        keyCommand === "note.new" ||
        keyCommand === "note.close" ||
        keyCommand === "note.reopenClosed" ||
        keyCommand === "search.open" ||
        keyCommand === "view.toggleSidebar" ||
        keyCommand === "view.toggleFocus" ||
        keyCommand === "settings.open" ||
        keyCommand.startsWith("view.tab")
      )) {
        e.preventDefault();
        executeCommand(keyCommand);
        return;
      }
      if (mod && e.key === "Tab") {
        // Tab cycling stays inside the single editor tab strip.
        e.preventDefault();
        docs.cycleTab(!e.shiftKey);
        return;
      }
      // Tree rename/trash follow platform convention (§43–§44): F2 + Delete
      // on Windows/Linux; Command+Backspace on macOS. Palette + context
      // menu stay universal fallbacks on every OS (§44, §155).
      const isMacTree = platform.platform === "macos";
      const sel = tree.selectedEntry;
      if (!isMacTree && e.key === "F2" && sel && !inField(e.target)) {
        e.preventDefault();
        tree.beginRename(sel.relativePath);
        return;
      }
      if (!isMacTree && e.key === "Delete" && sel && !inField(e.target)) {
        e.preventDefault();
        void tree.removeEntry(sel);
        return;
      }
      if (isMacTree && e.metaKey && e.key === "Backspace" && sel && !inField(e.target)) {
        e.preventDefault();
        void tree.removeEntry(sel);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [executeCommand, paletteOpen, platform, tree, docs, hotkeyOverrides]);
}
