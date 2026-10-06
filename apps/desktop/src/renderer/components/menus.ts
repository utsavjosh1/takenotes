import type { CommandId } from "@takenotes/core/commands/registry";
import type { DirectoryEntry, WorkspaceInfo } from "@takenotes/contracts/ipc";
import { isWslKind, moveToTrashLabel, revealLabel } from "@takenotes/platform/filesystem";
import { displayPath } from "./types";
import type { CtxMenu } from "./types";
import { getBridge } from "../bridge";
import type { PlatformState } from "../hooks/use-platform";
import type { PaneLayout } from "../panes";
import { paneDocs } from "../panes";

export type MenuOps = {
  openFile: (rel: string) => void;
  beginRename: (rel: string) => void;
  removeEntry: (entry: DirectoryEntry) => void;
  trashEntry: (entry: DirectoryEntry) => void;
  beginCreate: (dir: string, folder: boolean) => void;
  select: (rel: string) => void;
  closeTab: (key: string) => void;
  togglePinnedTab: (key: string) => void;
  executeCommand: (id: CommandId) => void;
  refreshAll: () => void;
  openLocal: () => void;
  addFavorite: (entry: DirectoryEntry) => void;
};

/** File/folder context menu. Pure factory: positioning stays with the
 * caller, items are built from the entry + platform + domain ops. */
export function buildFileMenu(
  e: React.MouseEvent,
  entry: DirectoryEntry,
  ctx: { workspaceId: string; workspaceType: WorkspaceInfo["type"]; platform: PlatformState; shortcut: (id: CommandId) => string; ops: MenuOps },
): NonNullable<CtxMenu> {
  const { platform, shortcut, ops } = ctx;
  const openable = entry.kind !== "directory" && (entry.fileClass === "markdown" || entry.fileClass === "text");
  ops.select(entry.relativePath);
  return {
    x: e.clientX, y: e.clientY,
    items: entry.kind === "directory" ? [
      { label: "New note here", run: () => ops.beginCreate(entry.relativePath, false) },
      { label: "New folder…", run: () => ops.beginCreate(entry.relativePath, true) },
      { label: "---", run: () => undefined },
      { label: "Rename", shortcut: shortcut("tree.rename"), run: () => ops.beginRename(entry.relativePath) },
      { label: "Copy relative path", run: () => void navigator.clipboard.writeText(displayPath(entry.relativePath)) },
      { label: "Add folder to Favorites", run: () => ops.addFavorite(entry) },
      { label: revealLabel(platform.platform), run: () => void getBridge()?.shell.reveal(ctx.workspaceId, entry.relativePath) },
      { label: "---", run: () => undefined },
      { label: "Delete folder", danger: true, run: () => void ops.removeEntry(entry) },
    ] : [
      { label: "Open", run: () => ops.openFile(entry.relativePath), disabled: !openable },
      { label: "Rename", shortcut: shortcut("tree.rename"), run: () => ops.beginRename(entry.relativePath) },
      { label: "Copy relative path", run: () => void navigator.clipboard.writeText(displayPath(entry.relativePath)) },
      { label: "Add to Favorites", run: () => ops.addFavorite(entry) },
      { label: revealLabel(platform.platform), run: () => void getBridge()?.shell.reveal(ctx.workspaceId, entry.relativePath) },
      { label: "---", run: () => undefined },
      { label: isWslKind(ctx.workspaceType) ? "Delete permanently…" : moveToTrashLabel(platform.platform), shortcut: shortcut("tree.trash"), danger: true, run: () => void ops.trashEntry(entry) },
    ],
  };
}

export function buildTabMenu(
  e: React.MouseEvent,
  key: string,
  layout: PaneLayout,
  ctx: { shortcut: (id: CommandId) => string; ops: MenuOps },
): NonNullable<CtxMenu> {
  const doc = layout.docs[key];
  return {
    x: e.clientX, y: e.clientY,
    items: [
      { label: doc?.pinned ? "Unpin tab" : "Pin tab", run: () => ctx.ops.togglePinnedTab(key) },
      { label: "Close", shortcut: ctx.shortcut("note.close"), run: () => ctx.ops.closeTab(key) },
      {
        label: "Close others",
        run: () => {
          for (const k of paneDocs(layout).map((d) => d.key).filter((k) => k !== key)) ctx.ops.closeTab(k);
        },
      },
      {
        label: "Close to the right",
        run: () => {
          const keys = paneDocs(layout).map((d) => d.key);
          for (const k of keys.slice(keys.indexOf(key) + 1)) ctx.ops.closeTab(k);
        },
      },
    ],
  };
}

export function buildSidebarMenu(
  e: React.MouseEvent,
  ctx: { shortcut: (id: CommandId) => string; ops: MenuOps },
): NonNullable<CtxMenu> {
  return {
    x: e.clientX, y: e.clientY,
    items: [
      { label: "New note", shortcut: ctx.shortcut("note.new"), run: () => ctx.ops.executeCommand("note.new") },
      { label: "New folder…", run: () => ctx.ops.beginCreate("", true) },
      { label: "---", run: () => undefined },
      { label: "Expand all folders", run: () => ctx.ops.executeCommand("tree.expandAll") },
      { label: "Collapse all folders", run: () => ctx.ops.executeCommand("tree.collapseAll") },
      { label: "Refresh file tree", run: () => ctx.ops.refreshAll() },
      { label: "Open another folder…", run: () => ctx.ops.openLocal() },
    ],
  };
}
