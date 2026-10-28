import { useMemo, useState, type JSX, type ReactNode } from "react";
import { CommandPalette, type PaletteItem } from "@takenotes/ui/dom";
import type { PaletteGroup } from "@takenotes/ui";
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
  const parsed = paletteKindOf(query);
  // In the palette plain text means a command; a first symbol (# @ ?) switches mode.
  const kind: PaletteKind = palette && parsed.kind === "files" ? "commands" : parsed.kind;
  const text = palette && parsed.kind === "files" ? query.trim() : parsed.text;
  const isPalette = palette || kind !== "files";

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

  const close = onClose;
  const label = isPalette ? "Command palette" : "Quick open";
  const placeholder = kind === "commands" ? "Type a command…" : kind === "tags" ? "Find a tag…" : kind === "schedule" ? "call Ron tomorrow 3pm" : kind === "search" ? "Search all notes…" : isPalette ? "Type a command, or # @ ?" : "Find a note…";

  const emptyText = kind === "files" ? "No recent notes yet. Type to find a note." : kind === "commands" ? "No matching commands." : kind === "tags" ? "No tags yet." : kind === "search" ? "Type what to look for." : "Type a task, for example: call Ron tomorrow 3pm.";
  const groups: PaletteGroup<PaletteItem>[] = [];
  for (const r of rows) {
    const item: PaletteItem = {
      id: r.id, label: r.label,
      ...(r.sub ? { description: r.sub } : {}), ...(r.tag ? { tag: r.tag } : {}), ...(r.kbd ? { hint: r.kbd } : {}),
      ...(r.disabled ? { disabledReason: r.disabled } : {}),
    };
    if (r.group || groups.length === 0) groups.push({ ...(r.group ? { heading: r.group } : kind === "files" && text === "" ? { heading: "Recent" } : {}), items: [item] });
    else groups[groups.length - 1]!.items.push(item);
  }

  return (
    <CommandPalette
      label={label}
      placeholder={placeholder}
      query={query}
      onQueryChange={setQuery}
      groups={groups}
      emptyText={emptyText}
      onClose={close}
      onSelect={(item, how) => {
        if (kind === "files" && how.shift) { if (text) { onCreateFile(text); close(); } return; }
        const r = rows.find((x) => x.id === item.id);
        if (!r || r.disabled) return;
        r.run(how);
        close();
      }}
      {...(isPalette ? {
        modes: PILLS.map((p) => ({ id: p.kind, label: p.kind === "schedule" ? "Schedule (concept)" : p.label, key: p.key, active: kind === p.kind })),
        onModeSelect: (id: string) => {
          const p = PILLS.find((x) => x.kind === id)!;
          setQuery(kind === p.kind && !(palette && p.kind === "commands") ? "" : p.kind === "commands" ? (palette ? "" : ">") : p.key);
        },
      } : {})}
      hints={[
        { keys: ["↑", "↓"], text: "move" },
        { keys: ["Enter"], text: kind === "commands" ? "run" : kind === "schedule" ? "add" : "open" },
        ...(kind === "files" ? [{ keys: ["Ctrl", "Enter"], text: "new tab" }, { keys: ["Shift", "Enter"], text: "create" }] : []),
        { keys: ["Esc"], text: "close" },
      ]}
    />
  );
}
