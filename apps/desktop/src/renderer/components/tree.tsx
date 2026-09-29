import { useState, type JSX } from "react";
import { EmptyState, IconButton } from "@takenotes/ui/dom";
import type { DirectoryEntry } from "@takenotes/contracts/ipc";
import { Icon } from "./icons";
import { displayPath, fileName } from "./types";

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
}): JSX.Element {
  return (
    <div role="tree" aria-label="Files">
      {entries.map((e) => (
        <TreeNode
          key={e.relativePath}
          entry={e}
          depth={0}
          tree={tree}
          activePath={activePath}
          onToggle={onToggle}
          onOpen={onOpen}
          onSelect={onSelect}
          onContext={onContext}
          onRenameCommit={onRenameCommit}
          onRenameCancel={onRenameCancel}
          onHoverFile={onHoverFile}
          onHoverEnd={onHoverEnd}
        />
      ))}
      {entries.length === 0 && (
        <EmptyState title="No notes yet" description="Markdown files you add here show up automatically." />
      )}
    </div>
  );
}

function TreeNode(props: {
  entry: DirectoryEntry;
  depth: number;
  tree: TreeState;
  activePath: string | null;
  onToggle: (dir: string) => void;
  onOpen: (entry: DirectoryEntry) => void;
  onSelect: (rel: string | null) => void;
  onContext: (e: React.MouseEvent, entry: DirectoryEntry) => void;
  onRenameCommit: (entry: DirectoryEntry, newName: string) => void;
  onRenameCancel: () => void;
  onHoverFile?: (rel: string, x: number, y: number) => void;
  onHoverEnd?: () => void;
}): JSX.Element {
  const { entry, depth, tree } = props;
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
        aria-selected={isActive}
        tabIndex={-1}
        data-rel={entry.relativePath}
        data-kind={entry.kind}
        className={`tree-row${isActive ? " selected" : ""}${!isDir && !openable ? " non-md" : ""}`}
        style={{ paddingLeft: 12 + depth * 16 }}
        title={displayPath(entry.relativePath)}
        draggable={!isDir}
        onDragStart={(e) => {
          if (isDir) return;
          e.dataTransfer.setData("takenotes/rel-path", entry.relativePath);
          e.dataTransfer.setData("text/uri-list", entry.relativePath);
          e.dataTransfer.effectAllowed = "copy";
        }}
        onClick={() => {
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
          <span className="chevron" style={{ visibility: "hidden" }} />
        )}
        <span className="file-icon">
          <Icon name={isDir ? "folder" : "file"} />
        </span>
        <span className="label">{entry.name}</span>
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
            <div className="tree-row" style={{ paddingLeft: 12 + (depth + 1) * 16, color: "var(--text-muted)" }}>
              <span className="label" style={{ fontSize: 12 }}>Loading…</span>
            </div>
          )}
          {kids.map((k) => (
            <TreeNode
              key={k.relativePath}
              entry={k}
              depth={depth + 1}
              tree={tree}
              activePath={props.activePath}
              onToggle={props.onToggle}
              onOpen={props.onOpen}
              onSelect={props.onSelect}
              onContext={props.onContext}
              onRenameCommit={props.onRenameCommit}
              onRenameCancel={props.onRenameCancel}
              onHoverFile={props.onHoverFile}
              onHoverEnd={props.onHoverEnd}
            />
          ))}
          {!tree.loading.has(entry.relativePath) && kids.length === 0 && (
            <div className="tree-row" style={{ paddingLeft: 12 + (depth + 1) * 16, color: "var(--text-muted)" }}>
              <span className="label" style={{ fontSize: 12 }}>Empty folder</span>
            </div>
          )}
        </div>
      )}
    </>
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
      <div className="tree-row" style={{ paddingLeft: 12 + depth * 16 }}>
        <span className="chevron" style={{ visibility: "hidden" }} />
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
