import { useRef, useState, type CSSProperties, type JSX } from "react";
import { EmptyState, IconButton } from "@takenotes/ui/dom";
import type { DirectoryEntry } from "@takenotes/contracts/ipc";
import { Icon } from "./icons";
import { displayPath, fileName } from "./types";

/** Folders show at most this many rows until "Show more". */
export const FOLDER_PAGE = 200;
const stem = (name: string): string => name.replace(/\.md$/i, "");

/** Shared per-tree interaction state: multi-select, paging and drag-move. */
type TreeCtx = {
  multi: ReadonlySet<string>;
  limits: ReadonlyMap<string, number>;
  dropDir: string | null;
  onMore: (dir: string) => void;
  onRowClick: (entry: DirectoryEntry, e: React.MouseEvent) => boolean;
  onDragStartRow: (entry: DirectoryEntry, e: React.DragEvent) => void;
  onDropOn: (dir: string, e: React.DragEvent) => void;
  setDropDir: (dir: string | null) => void;
};

export type TreeState = {
  expanded: Set<string>;
  children: Map<string, DirectoryEntry[]>;
  loading: Set<string>;
  renaming: string | null;
  selected: string | null;
};

export function FileTree({
  entries,
  tree,
  activePath,
  onToggle,
  onOpen,
  onSelect,
  onContext,
  onRenameCommit,
  onRenameCancel,
  onHoverFile,
  onHoverEnd,
  fileCounts,
  onMove,
}: {
  entries: DirectoryEntry[];
  tree: TreeState;
  activePath: string | null;
  onToggle: (dir: string) => void;
  onOpen: (entry: DirectoryEntry) => void;
  onSelect: (rel: string | null) => void;
  onContext: (e: React.MouseEvent, entry: DirectoryEntry) => void;
  onRenameCommit: (entry: DirectoryEntry, newName: string) => void;
  onRenameCancel: () => void;
  /** Step 2 explorer hover preview (App debounces + renders the card). */
  onHoverFile?: (rel: string, x: number, y: number) => void;
  onHoverEnd?: () => void;
  /** Notes under each folder (all depths), shown quietly at the row end. */
  fileCounts?: ReadonlyMap<string, number>;
  /** Drag-move entries into a folder ("" = workspace root). */
  onMove?: (rels: string[], destDir: string) => void;
}): JSX.Element {
  const [multi, setMulti] = useState<ReadonlySet<string>>(new Set());
  const [limits, setLimits] = useState<ReadonlyMap<string, number>>(new Map());
  const [dropDir, setDropDir] = useState<string | null>(null);
  const anchor = useRef<string | null>(null);
  const ctx: TreeCtx = {
    multi, limits, dropDir, setDropDir,
    onMore: (dir) => setLimits((m) => new Map(m).set(dir, (m.get(dir) ?? FOLDER_PAGE) + FOLDER_PAGE)),
    onRowClick: (entry, e) => {
      const rel = entry.relativePath;
      if (e.ctrlKey || e.metaKey) {
        setMulti((cur) => {
          const n = new Set(cur.size ? cur : tree.selected ? [tree.selected] : []);
          if (n.has(rel)) n.delete(rel); else n.add(rel);
          return n;
        });
        anchor.current = rel;
        return true;
      }
      if (e.shiftKey && anchor.current) {
        const rows = e.currentTarget.closest('[role="tree"]')?.querySelectorAll<HTMLElement>('[role="treeitem"]');
        const order = [...(rows ?? [])].map((el) => el.dataset.rel ?? "");
        const a = order.indexOf(anchor.current);
        const b = order.indexOf(rel);
        if (a >= 0 && b >= 0) { setMulti(new Set(order.slice(Math.min(a, b), Math.max(a, b) + 1))); return true; }
      }
      anchor.current = rel;
      if (multi.size) setMulti(new Set());
      return false;
    },
    onDragStartRow: (entry, e) => {
      const rels = multi.has(entry.relativePath) ? [...multi] : [entry.relativePath];
      e.dataTransfer.setData("takenotes/rel-paths", JSON.stringify(rels));
      e.dataTransfer.setData("takenotes/rel-path", entry.relativePath);
      if (entry.kind !== "directory") e.dataTransfer.setData("text/uri-list", entry.relativePath);
      e.dataTransfer.effectAllowed = "copyMove";
    },
    onDropOn: (dir, e) => {
      setDropDir(null);
      const raw = e.dataTransfer.getData("takenotes/rel-paths");
      if (!raw || !onMove) return;
      e.preventDefault();
      try { onMove(JSON.parse(raw) as string[], dir); } catch { /* malformed drag payload */ }
    },
  };
  const rootLimit = limits.get("") ?? FOLDER_PAGE;
  // Step 9 roving tabindex: the selected row is the single Tab stop (or
  // the first row when nothing is selected yet) — arrows then move both
  // selection and DOM focus via onTreeKeyDown in use-file-tree.
  const tabbableRel = tree.selected ?? entries[0]?.relativePath ?? null;
  return (
    <div role="tree" aria-label="Files">
      {entries.slice(0, rootLimit).map((e) => (
        <TreeNode
          key={e.relativePath}
          entry={e}
          depth={0}
          tree={tree}
          tabbableRel={tabbableRel}
          activePath={activePath}
          onToggle={onToggle}
          onOpen={onOpen}
          onSelect={onSelect}
          onContext={onContext}
          onRenameCommit={onRenameCommit}
          onRenameCancel={onRenameCancel}
          onHoverFile={onHoverFile}
          onHoverEnd={onHoverEnd}
          fileCounts={fileCounts}
          ctx={ctx}
        />
      ))}
      {entries.length > rootLimit && <ShowMore depth={0} hidden={entries.length - rootLimit} onClick={() => ctx.onMore("")} />}
      {entries.length === 0 && (
        <EmptyState title="No notes yet" description="Notes you add here show up automatically." />
      )}
    </div>
  );
}

function TreeNode(props: {
  entry: DirectoryEntry;
  depth: number;
  tree: TreeState;
  tabbableRel: string | null;
  activePath: string | null;
  onToggle: (dir: string) => void;
  onOpen: (entry: DirectoryEntry) => void;
  onSelect: (rel: string | null) => void;
  onContext: (e: React.MouseEvent, entry: DirectoryEntry) => void;
  onRenameCommit: (entry: DirectoryEntry, newName: string) => void;
  onRenameCancel: () => void;
  onHoverFile?: (rel: string, x: number, y: number) => void;
  onHoverEnd?: () => void;
  fileCounts?: ReadonlyMap<string, number>;
  ctx: TreeCtx;
}): JSX.Element {
  const { entry, depth, tree, ctx } = props;
  const isDir = entry.kind === "directory";
  const expanded = tree.expanded.has(entry.relativePath);
  const kids = tree.children.get(entry.relativePath) ?? [];
  const isActive = props.activePath === entry.relativePath;
  const isRenaming = tree.renaming === entry.relativePath;
  const openable = !isDir && (entry.fileClass === "markdown" || entry.fileClass === "text");

  if (isRenaming) {
    return (
      <RenameRow entry={entry} depth={depth} onCommit={props.onRenameCommit} onCancel={props.onRenameCancel} />
    );
  }

  return (
    <>
      <div
        role="treeitem"
        aria-expanded={isDir ? expanded : undefined}
        aria-selected={isActive || ctx.multi.has(entry.relativePath)}
        tabIndex={entry.relativePath === props.tabbableRel ? 0 : -1}
        data-rel={entry.relativePath}
        data-kind={entry.kind}
        className={`tree-row${isActive || ctx.multi.has(entry.relativePath) ? " selected" : ""}${!isDir && !openable ? " non-md" : ""}${isDir && ctx.dropDir === entry.relativePath ? " drop-target" : ""}`}
        style={{ "--depth": depth } as CSSProperties}
        title={displayPath(entry.relativePath)}
        draggable
        onDragStart={(e) => ctx.onDragStartRow(entry, e)}
        onDragOver={isDir ? (e) => {
          if (e.dataTransfer.types.includes("takenotes/rel-paths")) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; ctx.setDropDir(entry.relativePath); }
        } : undefined}
        onDragLeave={isDir ? () => { if (ctx.dropDir === entry.relativePath) ctx.setDropDir(null); } : undefined}
        onDrop={isDir ? (e) => ctx.onDropOn(entry.relativePath, e) : undefined}
        onClick={(e) => {
          if (ctx.onRowClick(entry, e)) return;
          props.onSelect(entry.relativePath);
          if (isDir) props.onToggle(entry.relativePath);
          else props.onOpen(entry);
        }}
        onContextMenu={(e) => props.onContext(e, entry)}
        onMouseEnter={(e) => { if (!isDir && openable) props.onHoverFile?.(entry.relativePath, e.clientX, e.clientY); }}
        onMouseLeave={() => props.onHoverEnd?.()}
      >
        {isDir ? (
          <span className="chevron">
            <Icon name={expanded ? "chevronDown" : "chevronRight"} />
          </span>
        ) : (
          <span className="chevron" aria-hidden="true" />
        )}
        <span className="label">{isDir ? entry.name : stem(entry.name)}</span>
        {isDir && props.fileCounts?.has(entry.relativePath) && <span className="count" aria-label={`${props.fileCounts.get(entry.relativePath)} notes`}>{props.fileCounts.get(entry.relativePath)}</span>}
        <IconButton
          className="row-more"
          tabIndex={-1}
          label={`More actions for ${entry.name}`}
          onClick={(e) => {
            e.stopPropagation();
            props.onContext(e, entry);
          }}
        >
          <Icon name="more" />
        </IconButton>
      </div>
      {isDir && expanded && (
        <div role="group">
          {tree.loading.has(entry.relativePath) && (
            <div className="tree-row tree-note" style={{ "--depth": depth + 1 } as CSSProperties}>
              <span className="label">Loading…</span>
            </div>
          )}
          {kids.slice(0, ctx.limits.get(entry.relativePath) ?? FOLDER_PAGE).map((k) => (
            <TreeNode
              key={k.relativePath}
              entry={k}
              depth={depth + 1}
              tree={tree}
              tabbableRel={props.tabbableRel}
              activePath={props.activePath}
              onToggle={props.onToggle}
              onOpen={props.onOpen}
              onSelect={props.onSelect}
              onContext={props.onContext}
              onRenameCommit={props.onRenameCommit}
              onRenameCancel={props.onRenameCancel}
              onHoverFile={props.onHoverFile}
              onHoverEnd={props.onHoverEnd}
              fileCounts={props.fileCounts}
              ctx={ctx}
            />
          ))}
          {kids.length > (ctx.limits.get(entry.relativePath) ?? FOLDER_PAGE) && (
            <ShowMore depth={depth + 1} hidden={kids.length - (ctx.limits.get(entry.relativePath) ?? FOLDER_PAGE)} onClick={() => ctx.onMore(entry.relativePath)} />
          )}
          {!tree.loading.has(entry.relativePath) && kids.length === 0 && (
            <div className="tree-row tree-note" style={{ "--depth": depth + 1 } as CSSProperties}>
              <span className="label">Empty folder</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function ShowMore({ depth, hidden, onClick }: { depth: number; hidden: number; onClick: () => void }): JSX.Element {
  return (
    <button className="tree-row tree-more" style={{ "--depth": depth } as CSSProperties} onClick={onClick}>
      <span className="label">Show more ({hidden})</span>
    </button>
  );
}

export function RenameRow({
  entry,
  depth,
  onCommit,
  onCancel,
}: {
  entry: DirectoryEntry;
  depth: number;
  onCommit: (entry: DirectoryEntry, newName: string) => void;
  onCancel: () => void;
}): JSX.Element {
  const [value, setValue] = useState(entry.name);
  const [error, setError] = useState<string | null>(null);
  const commit = (): void => {
    const v = value.trim();
    if (!v) {
      setError("Enter a file name.");
      return;
    }
    // eslint-disable-next-line no-control-regex
    if (/[<>:"/\\|?*\u0000-\u001f]/.test(v)) {
      setError("That name contains characters Windows does not allow.");
      return;
    }
    if (v !== entry.name) onCommit(entry, v);
    else onCancel();
  };
  return (
    <>
      <div className="tree-row" style={{ "--depth": depth } as CSSProperties}>
        <span className="chevron" aria-hidden="true" />
        <input
          className="rename-input"
          autoFocus
          value={value}
          aria-label={`Rename ${fileName(entry.relativePath)}`}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") onCancel();
            e.stopPropagation();
          }}
          onBlur={commit}
          onClick={(e) => e.stopPropagation()}
          onFocus={(e) => {
            const dot = e.target.value.lastIndexOf(".");
            e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length);
          }}
        />
      </div>
      {error && <div className="rename-error" role="alert">{error}</div>}
    </>
  );
}
