import { useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from "react";
import {
  COMMAND_GROUPS,
  commandDisabledReason,
  commandGroup,
  fuzzyPositions,
  fuzzyScore,
  parseQuickTask,
  searchCommands,
  searchQuickOpen,
  searchTagList,
  type CommandSearchItem,
  type PaletteKind,
  type QuickOpenItem,
  paletteKindOf,
} from "@takenotes/core/commands/palette";
import { displayPath, fileName } from "./types";

export { fuzzyScore };
export type CommandItem = CommandSearchItem & { run: () => void };

type Row = {
  id: string;
  label: ReactNode;
  sub?: string;
  kbd?: string;
  tag?: string;
  disabled?: string;
  group?: string;
  run: (o: { ctrl: boolean; shift: boolean }) => boolean | void;
};

const PILLS: Array<{ kind: PaletteKind; label: string; key: string }> = [
  { kind: "commands", label: "Commands", key: ">" },
  { kind: "tags", label: "Tags", key: "#" },
  { kind: "schedule", label: "Schedule", key: "@" },
  { kind: "search", label: "Search", key: "?" },
];

/** Letters the person typed, emphasised inside the name. */
function Emph({ text, needle }: { text: string; needle: string }): JSX.Element {
  const pos = new Set(fuzzyPositions(text, needle) ?? []);
  if (pos.size === 0) return <>{text}</>;
  return <>{[...text].map((ch, i) => (pos.has(i) ? <b key={i} className="em">{ch}</b> : ch))}</>;
}

/** Quick Open (Ctrl+P) and the command palette (Ctrl+Shift+P): one overlay, five modes picked by the first character. */
export function CommandMenu({
  initialQuery = "",
  files,
  recents,
  commands,
  recentCommands,
  tags,
  onOpenFile,
  onCreateFile,
  onAddTask,
  onSearch,
  onOpenTag,
  onClose,
}: {
  initialQuery?: string;
  files: QuickOpenItem[];
  recents: string[];
  commands: CommandItem[];
  recentCommands: string[];
  tags: Array<{ tag: string; count: number }>;
  /** `newTab` opens the note in a new tab (Ctrl+Enter). */
  onOpenFile: (rel: string, opts?: { newTab?: boolean }) => void;
  onCreateFile: (name: string) => void;
  /** Adds a task to the Inbox (the "@" mode). */
  onAddTask: (text: string, scheduled: string) => Promise<boolean>;
  onSearch: (query: string) => void;
  onOpenTag: (tag: string) => void;
  onClose: () => void;
}): JSX.Element {
  // Ctrl+Shift+P opens the palette (commands by default); Ctrl+P opens Quick Open.
  const palette = initialQuery.startsWith(">");
  const [query, setQuery] = useState(initialQuery.replace(/^>\s*/, ""));
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<Element | null>(document.activeElement);
  const parsed = paletteKindOf(query);
  // In the palette plain text means a command; a first symbol (# @ ?) switches mode.
  const kind: PaletteKind = palette && parsed.kind === "files" ? "commands" : parsed.kind;
  const text = palette && parsed.kind === "files" ? query.trim() : parsed.text;
  const isPalette = palette || kind !== "files";
  const listId = "cmd-listbox";

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    if (kind === "files") {
      for (const it of searchQuickOpen(files, text, recents)) {
        const name = it.title || fileName(it.relativePath).replace(/\.md$/i, "");
        const folder = displayPath(it.relativePath).split("/").slice(0, -1).join("/");
        out.push({
          id: it.relativePath, label: <Emph text={name} needle={text} />, sub: folder || undefined, tag: !text && it.recent ? "recent" : undefined,
          run: (o) => { onOpenFile(it.relativePath, { newTab: o.ctrl }); },
        });
      }
      if (text) out.push({ id: "__create", label: <>Create “{text}”</>, tag: "new", run: () => { onCreateFile(text); } });
    } else if (kind === "commands") {
      const list = searchCommands(commands, text, recentCommands, text ? 50 : 200);
      const ranked = text ? list : list;
      const byGroup = text ? null : COMMAND_GROUPS.map((g) => ({ g, items: ranked.filter((c) => commandGroup(c) === g) })).filter((x) => x.items.length > 0);
      const push = (c: CommandItem, group?: string): void => {
        out.push({
          id: c.id, label: <Emph text={c.title} needle={text} />, kbd: c.shortcut || undefined, group,
          sub: c.enabled === false ? undefined : (text ? commandGroup(c) : undefined),
          disabled: c.enabled === false ? commandDisabledReason(c.id) : undefined,
          run: () => { c.run(); },
        });
      };
      if (byGroup) for (const { g, items } of byGroup) items.forEach((c, i) => push(c, i === 0 ? g : undefined));
      else ranked.forEach((c) => push(c));
    } else if (kind === "tags") {
      for (const t of searchTagList(tags, text)) {
        out.push({ id: t.tag, label: <>#<Emph text={t.tag} needle={text} /></>, sub: `${t.count} ${t.count === 1 ? "note" : "notes"}`, run: () => { onOpenTag(t.tag); } });
      }
    } else if (kind === "search") {
      if (text) out.push({ id: "__search", label: <>Search notes for “{text}”</>, run: () => { onSearch(text); } });
    } else if (kind === "schedule") {
      const t = parseQuickTask(text, new Date());
      if (t) {
        out.push({
          id: "__task", label: <>Task · {t.label}</>, sub: t.text, tag: "concept",
          run: () => { void onAddTask(t.text, t.date ? `${t.date}${t.time ? ` ${t.time}` : ""}` : ""); },
        });
      }
    }
    return out;
  }, [kind, text, files, recents, commands, recentCommands, tags, onOpenFile, onCreateFile, onAddTask, onSearch, onOpenTag]);

  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    inputRef.current?.focus();
    const opener = openerRef.current;
    return () => { if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    document.getElementById(`cmd-opt-${index}`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const close = onClose;
  const commit = (o: { ctrl: boolean; shift: boolean }): void => {
    if (kind === "files" && o.shift) { if (text) { onCreateFile(text); close(); } return; }
    const r = rows[Math.min(index, rows.length - 1)];
    if (!r || r.disabled) return;
    r.run(o);
    close();
  };

  const label = isPalette ? "Command palette" : "Quick open";
  const placeholder = kind === "commands" ? "Type a command…" : kind === "tags" ? "Find a tag…" : kind === "schedule" ? "call Ron tomorrow 3pm" : kind === "search" ? "Search all notes…" : isPalette ? "Type a command, or # @ ?" : "Find a note…";
  return (
    <div className="scrim" onMouseDown={close}>
      <div className="command-menu" role="dialog" aria-modal="true" aria-label={label} onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } }}>
        <input
          ref={inputRef}
          className="cmd-input"
          placeholder={placeholder}
          value={query}
          aria-label={label}
          role="combobox"
          aria-expanded={rows.length > 0}
          aria-controls={listId}
          aria-activedescendant={rows.length > 0 ? `cmd-opt-${Math.min(index, rows.length - 1)}` : undefined}
          aria-autocomplete="list"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, Math.max(0, rows.length - 1))); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
            else if (e.key === "Home") { e.preventDefault(); setIndex(0); }
            else if (e.key === "End") { e.preventDefault(); setIndex(Math.max(0, rows.length - 1)); }
            else if (e.key === "Enter") { e.preventDefault(); commit({ shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey }); }
          }}
        />
        {isPalette && (
          <div className="cmd-modes" role="group" aria-label="Palette mode">
            {PILLS.map((p) => (
              <button key={p.kind} type="button" tabIndex={-1} className={`pm${kind === p.kind ? " on" : ""}`}
                onMouseDown={(e) => e.preventDefault()} onClick={() => { setQuery(kind === p.kind && !(palette && p.kind === "commands") ? "" : p.kind === "commands" ? (palette ? "" : ">") : p.key); inputRef.current?.focus(); }}>
                <kbd>{p.key}</kbd>{p.label}{p.kind === "schedule" && <span className="concept">Concept</span>}
              </button>
            ))}
          </div>
        )}
        <div className="cmd-list" role="listbox" id={listId} aria-label={kind === "files" ? "Matching notes" : "Results"}>
          {kind === "files" && text === "" && rows.length > 0 && <div className="cmd-section" role="presentation">Recent</div>}
          {rows.length === 0 && (
            <div className="cmd-section" role="presentation">
              {kind === "files" ? "No recent notes yet. Type to find a note." : kind === "commands" ? "No matching commands." : kind === "tags" ? "No tags yet." : kind === "search" ? "Type what to look for." : "Type a task, like “call Ron tomorrow 3pm”."}
            </div>
          )}
          {rows.map((r, i) => (
            <div key={r.id} role="presentation">
              {r.group && <div className="cmd-section" role="presentation">{r.group}</div>}
              <div id={`cmd-opt-${i}`} role="option" aria-selected={i === index} aria-disabled={r.disabled ? true : undefined}
                className={`cmd-item${i === index ? " selected" : ""}${r.disabled ? " disabled" : ""}${r.id === "__create" ? " create" : ""}`}
                onMouseEnter={() => setIndex(i)}
                onClick={(e) => { if (r.disabled) return; r.run({ ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey }); close(); }}>
                <span className="main-label">{r.label}</span>
                {r.disabled ? <span className="sub-label">{r.disabled}</span> : r.sub && <span className="sub-label">{r.sub}</span>}
                {r.tag && <span className={`concept${r.tag === "concept" ? "" : " plain"}`}>{r.tag}</span>}
                {r.kbd && <kbd>{r.kbd}</kbd>}
              </div>
            </div>
          ))}
        </div>
        <div className="cmd-foot" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
          <span><kbd>Enter</kbd> {kind === "commands" ? "run" : kind === "schedule" ? "add" : "open"}</span>
          {kind === "files" && <><span><kbd>Ctrl</kbd>+<kbd>Enter</kbd> new tab</span><span><kbd>Shift</kbd>+<kbd>Enter</kbd> create</span></>}
          <span><kbd>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
