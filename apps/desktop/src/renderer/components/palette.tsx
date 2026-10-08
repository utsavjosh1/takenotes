import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import {
  commandQueryText,
  fuzzyScore,
  paletteModeForQuery,
  searchCommands,
  searchQuickOpen,
  type CommandSearchItem,
  type QuickOpenItem,
} from "@takenotes/core/commands/palette";
import { displayPath, fileName } from "./types";

export { fuzzyScore };
export type CommandItem = CommandSearchItem & { run: () => void };

export function CommandMenu({
  initialQuery = "",
  files,
  recents,
  commands,
  recentCommands,
  onOpenFile,
  onCreateFile,
  onClose,
}: {
  initialQuery?: string;
  files: QuickOpenItem[];
  recents: string[];
  commands: CommandItem[];
  recentCommands: string[];
  onOpenFile: (rel: string, opts?: { keepOpen?: boolean }) => void;
  /** Step 2: create-on-Enter when no match, Shift+Enter exact-name create. */
  onCreateFile: (name: string) => void;
  onClose: () => void;
}): JSX.Element {
  const [query, setQuery] = useState(initialQuery);
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const mode = paletteModeForQuery(query);
  const commandText = commandQueryText(query);

  const quickItems = useMemo(() => searchQuickOpen(files, query, recents), [files, recents, query]);
  const cmdItems = useMemo(() => searchCommands(commands, commandText, recentCommands), [commands, recentCommands, commandText]);

  const count = mode === "quickOpen" ? quickItems.length : cmdItems.length;
  useEffect(() => setIndex(0), [query, mode]);
  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  /* Step 2 frozen contract: Enter = open best match else create typed name;
   * Shift+Enter = force exact-name create; Ctrl+Enter = open but keep the
   * palette open for multi-open (no splits in MVP, so "new tab" would be
   * a behavioral no-op otherwise). */
  const commit = (opts?: { shift?: boolean; ctrl?: boolean }): void => {
    if (mode === "quickOpen") {
      const q = query.trim();
      if (opts?.shift) {
        if (!q) return;
        onCreateFile(q);
        onClose();
        return;
      }
      const it = quickItems[index];
      if (it) {
        onOpenFile(it.relativePath, opts?.ctrl ? { keepOpen: true } : undefined);
        if (!opts?.ctrl) onClose();
        return;
      }
      if (q) {
        onCreateFile(q);
        onClose();
      }
    } else {
      const it = cmdItems[index];
      if (it && it.enabled !== false) {
        it.run();
        onClose();
      }
    }
  };

  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="command-menu" role="dialog" aria-label={mode === "quickOpen" ? "Quick open" : "Command palette"} onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="cmd-input"
          placeholder={mode === "quickOpen" ? "Type a note name…" : "> Type a command…"}
          value={query}
          aria-label={mode === "quickOpen" ? "Quick open" : "Command palette"}
          role="combobox"
          aria-expanded={count > 0}
          aria-controls="cmd-listbox"
          aria-activedescendant={count > 0 ? `cmd-opt-${Math.min(index, count - 1)}` : undefined}
          aria-autocomplete="list"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, Math.max(0, count - 1))); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
            else if (e.key === "Home") { e.preventDefault(); setIndex(0); }
            else if (e.key === "End") { e.preventDefault(); setIndex(Math.max(0, count - 1)); }
            else if (e.key === "Enter") { e.preventDefault(); commit({ shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey }); }
          }}
        />
        <div className="cmd-list" role="listbox" id="cmd-listbox" aria-label={mode === "quickOpen" ? "Matching notes" : "Matching commands"}>
          {mode === "quickOpen" && query.trim() === "" && <div className="cmd-section">Recent</div>}
          {mode === "quickOpen" &&
            (quickItems.length === 0 ? (
              <div className="cmd-section">{query.trim() ? `Enter creates "${query.trim()}".` : "No recent notes yet."}</div>
            ) : (
              quickItems.map((it, i) => (
                <div
                  key={`${it.workspaceId}:${it.relativePath}`}
                  id={`cmd-opt-${i}`}
                  role="option"
                  aria-selected={i === index}
                  className={`cmd-item${i === index ? " selected" : ""}`}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => { onOpenFile(it.relativePath); onClose(); }}
                >
                  <span className="main-label">{it.title || fileName(it.relativePath)}</span>
                  {it.recent && <span className="sub-label">recent</span>}
                  <span className="sub-label">{displayPath(it.relativePath)}</span>
                </div>
              ))
            ))}
          {mode === "quickOpen" && query.trim() !== "" && quickItems.length > 0 && (
            <div className="cmd-section">Enter open · Shift+Enter create · Ctrl+Enter open, keep open</div>
          )}
          {mode === "commands" &&
            (cmdItems.length === 0 ? (
              <div className="cmd-section">No matching commands.</div>
            ) : (
              cmdItems.map((c, i) => (
                <div
                  key={c.id}
                  id={`cmd-opt-${i}`}
                  role="option"
                  aria-selected={i === index}
                  aria-disabled={c.enabled === false}
                  className={`cmd-item${i === index ? " selected" : ""}${c.enabled === false ? " disabled" : ""}`}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => { if (c.enabled !== false) { c.run(); onClose(); } }}
                >
                  <span className="main-label">{c.title}</span>
                  {c.shortcut && <kbd>{c.shortcut}</kbd>}
                  <span className="sub-label">{c.category}</span>
                </div>
              ))
            ))}
        </div>
      </div>
    </div>
  );
}
