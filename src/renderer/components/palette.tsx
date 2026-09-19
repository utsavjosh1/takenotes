import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import {
  commandQueryText,
  fuzzyScore,
  paletteModeForQuery,
  searchCommands,
  searchQuickOpen,
  type CommandSearchItem,
  type QuickOpenItem,
} from "../../shared/commands/palette";
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
  onClose,
}: {
  initialQuery?: string;
  files: QuickOpenItem[];
  recents: string[];
  commands: CommandItem[];
  recentCommands: string[];
  onOpenFile: (rel: string) => void;
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

  const commit = (): void => {
    if (mode === "quickOpen") {
      const it = quickItems[index];
      if (it) {
        onOpenFile(it.relativePath);
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
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, Math.max(0, count - 1))); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
            else if (e.key === "Enter") commit();
          }}
        />
        <div className="cmd-list" role="listbox">
          {mode === "quickOpen" && query.trim() === "" && <div className="cmd-section">Recent</div>}
          {mode === "quickOpen" &&
            (quickItems.length === 0 ? (
              <div className="cmd-section">{query ? "No matching notes." : "No recent notes yet."}</div>
            ) : (
              quickItems.map((it, i) => (
                <div
                  key={`${it.workspaceId}:${it.relativePath}`}
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
          {mode === "commands" &&
            (cmdItems.length === 0 ? (
              <div className="cmd-section">No matching commands.</div>
            ) : (
              cmdItems.map((c, i) => (
                <div
                  key={c.id}
                  role="option"
                  aria-selected={i === index}
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
