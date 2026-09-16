import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { displayPath, fileName } from "./types";

export type PaletteMode = { kind: "quick" } | { kind: "commands" };
export type CommandItem = { id: string; title: string; shortcut?: string; run: () => void };

export function fuzzyScore(hay: string, needle: string): number {
  const h = hay.toLowerCase();
  const n = needle.toLowerCase().trim();
  if (!n) return 0;
  if (h === n) return 1000;
  if (h.startsWith(n)) return 500 + n.length;
  if (h.includes(n)) return 300 + n.length;
  let hi = 0;
  let score = 0;
  for (const ch of n) {
    const i = h.indexOf(ch, hi);
    if (i < 0) return -1;
    score += i === hi ? 2 : 1;
    hi = i + 1;
  }
  return score;
}

export function CommandMenu({
  mode,
  files,
  recents,
  commands,
  recentCommands,
  onOpenFile,
  onClose,
}: {
  mode: PaletteMode;
  files: { relativePath: string }[];
  recents: string[];
  commands: CommandItem[];
  recentCommands: string[];
  onOpenFile: (rel: string) => void;
  onClose: () => void;
}): JSX.Element {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const quickItems = useMemo(() => {
    const q = query.trim();
    if (!q) {
      const items = recents.filter((r) => files.some((f) => f.relativePath === r)).slice(0, 8);
      return items.map((relativePath) => ({ relativePath, recent: true }));
    }
    return files
      .map((f) => ({ f, s: Math.max(fuzzyScore(fileName(f.relativePath), q), fuzzyScore(displayPath(f.relativePath), q) - 50) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 30)
      .map((x) => ({ relativePath: x.f.relativePath, recent: recents.includes(x.f.relativePath) }));
  }, [files, recents, query]);

  const cmdItems = useMemo(() => {
    const q = query.trim();
    const ordered = [...commands].sort((a, b) => recentCommands.indexOf(b.id) - recentCommands.indexOf(a.id));
    if (!q) return ordered.slice(0, 12);
    return ordered
      .map((c) => ({ c, s: fuzzyScore(c.title, q) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c);
  }, [commands, recentCommands, query]);

  const count = mode.kind === "quick" ? quickItems.length : cmdItems.length;
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
    if (mode.kind === "quick") {
      const it = quickItems[index];
      if (it) {
        onOpenFile(it.relativePath);
        onClose();
      }
    } else {
      const it = cmdItems[index];
      if (it) {
        it.run();
        onClose();
      }
    }
  };

  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="command-menu" role="dialog" aria-label={mode.kind === "quick" ? "Quick open" : "Command palette"} onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="cmd-input"
          placeholder={mode.kind === "quick" ? "Type a note name…" : "Type a command…"}
          value={query}
          aria-label={mode.kind === "quick" ? "Quick open" : "Command palette"}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, count - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
            else if (e.key === "Enter") commit();
          }}
        />
        <div className="cmd-list" role="listbox">
          {mode.kind === "quick" && query.trim() === "" && <div className="cmd-section">Recent</div>}
          {mode.kind === "quick" &&
            (quickItems.length === 0 ? (
              <div className="cmd-section">{query ? "No matching notes." : "No recent notes yet."}</div>
            ) : (
              quickItems.map((it, i) => (
                <div
                  key={it.relativePath}
                  role="option"
                  aria-selected={i === index}
                  className={`cmd-item${i === index ? " selected" : ""}`}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => { onOpenFile(it.relativePath); onClose(); }}
                >
                  <span className="main-label">{fileName(it.relativePath)}</span>
                  {it.recent && <span className="sub-label">recent</span>}
                  <span className="sub-label">{displayPath(it.relativePath)}</span>
                </div>
              ))
            ))}
          {mode.kind === "commands" &&
            (cmdItems.length === 0 ? (
              <div className="cmd-section">No matching commands.</div>
            ) : (
              cmdItems.map((c, i) => (
                <div
                  key={c.id}
                  role="option"
                  aria-selected={i === index}
                  className={`cmd-item${i === index ? " selected" : ""}`}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => { c.run(); onClose(); }}
                >
                  <span className="main-label">{c.title}</span>
                  {c.shortcut && <kbd>{c.shortcut}</kbd>}
                </div>
              ))
            ))}
        </div>
      </div>
    </div>
  );
}
