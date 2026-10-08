import { useCallback, useEffect, useMemo, useState } from "react";
import type { DirectoryEntry, WorkspaceInfo } from "@takenotes/contracts/ipc";
import { ancestorsOf, DEFAULT_EXPLORER_SORT, parseExplorerSort, sortEntries, type ExplorerSort } from "@takenotes/core/explorer/sort";
import { isWslKind, moveToTrashLabel, trashName } from "@takenotes/platform/filesystem";
import { workspaceIndex } from "../index/workspace-index";
import { joinRel, parentDir } from "../components/types";
import type { TreeState } from "../components/tree";
import { useIndexMeta } from "../stores/index-meta";
import { useSettingsStore } from "../stores/settings";
import { getBridge } from "../bridge";
import { usePlatform } from "./use-platform";
import type { Notify } from "./use-notify";
import type { DocumentsApi } from "./use-documents";

export type CreatingState = { dir: string; folder: boolean } | null;

export type FileTreeApi = {
  entries: DirectoryEntry[];
  allFiles: DirectoryEntry[];
  tree: TreeState;
  sidebarLoading: boolean;
  creating: CreatingState;
  createName: string;
  setCreateName: (n: string) => void;
  refresh: (ws: WorkspaceInfo) => Promise<void>;
  rebuild: (ws: WorkspaceInfo) => Promise<void>;
  toggleDir: (dir: string) => Promise<void>;
  beginCreate: (dir: string, folder: boolean) => void;
  createUntitledNote: (dir?: string) => Promise<void>;
  createUntitledCanvas: (dir?: string) => Promise<void>;
  cancelCreate: () => void;
  commitCreate: () => Promise<void>;
  commitRename: (entry: DirectoryEntry, newName: string) => Promise<void>;
  removeEntry: (entry: DirectoryEntry) => Promise<void>;
  /** Deterministic teardown of all workspace-scoped tree state (H5). */
  resetTree: () => void;
  select: (rel: string | null) => void;
  beginRename: (rel: string) => void;
  cancelRename: () => void;
  visibleRows: DirectoryEntry[];
  onTreeKeyDown: (e: React.KeyboardEvent) => void;
  /** Currently selected entry, if it still exists. */
  selectedEntry: DirectoryEntry | undefined;
  /** Directory a new note should land in (selected dir, else root). */
  preferredNewNoteDir: () => string;
  /** Explorer sort (persisted per-workspace, logical app-data/ui.json). */
  sort: ExplorerSort;
  setSort: (s: ExplorerSort) => void;
  /** Expand ancestors (loading as needed) + select. Used on Quick Open/palette/link open. */
  reveal: (rel: string) => Promise<void>;
  expandAll: () => Promise<void>;
  collapseAll: () => void;
};

/** File tree + entry mutations. Owns the root listing, lazy children,
 * creation/rename/delete flows, and keyboard navigation. Index and open-doc
 * side-effects go through the shared index store and the documents API. */
export function useFileTree(
  workspace: WorkspaceInfo | null,
  docs: DocumentsApi,
  notify: Notify,
  reportHealth: (message: string | null) => void,
): FileTreeApi {
  const { toast, errToast } = notify;
  const bumpIndex = useIndexMeta((s) => s.bump);
  const confirmTrash = useSettingsStore((s) => s.settings.confirmTrash);
  const autoUpdateLinks = useSettingsStore((s) => s.settings.autoUpdateLinks);
  const platform = usePlatform();

  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [tree, setTree] = useState<TreeState>({ expanded: new Set(), children: new Map(), loading: new Set(), renaming: null, selected: null });
  const [allFiles, setAllFiles] = useState<DirectoryEntry[]>([]);
  const [creating, setCreating] = useState<CreatingState>(null);
  const [createName, setCreateName] = useState("");
  const [sidebarLoading, setSidebarLoading] = useState(false);
  // Logical app-data/ui.json: sort persists per workspace, default name-asc.
  const [sort, setSortState] = useState<ExplorerSort>(DEFAULT_EXPLORER_SORT);

  useEffect(() => {
    if (!workspace) return;
    try {
      const raw = localStorage.getItem(`takenotes.explorerSort.${workspace.workspaceId}`)
        ?? localStorage.getItem("takenotes.explorerSort");
      setSortState(raw ? parseExplorerSort(JSON.parse(raw)) : DEFAULT_EXPLORER_SORT);
    } catch {
      setSortState(DEFAULT_EXPLORER_SORT);
    }
  }, [workspace?.workspaceId]);

  const setSort = useCallback((s: ExplorerSort) => {
    setSortState(s);
    try {
      const ws = workspace?.workspaceId;
      localStorage.setItem(ws ? `takenotes.explorerSort.${ws}` : "takenotes.explorerSort", JSON.stringify(s));
    } catch { /* ignore */ }
  }, [workspace?.workspaceId]);

  // C1: loads take the workspace explicitly so open-time choreography never
  // depends on the hook's (possibly pre-open) captured workspace.
  const refresh = useCallback(async (ws: WorkspaceInfo) => {
    setSidebarLoading(true);
    reportHealth(null);
    const bridge = getBridge();
    if (!bridge) { setSidebarLoading(false); errToast({ code: "INTERNAL_ERROR", message: "Desktop bridge unavailable." }); return; }
    const res = await bridge.directory.list(ws.workspaceId, "");
    setSidebarLoading(false);
    if (res.ok) {
      setEntries(res.result);
      setTree((p) => ({ ...p, children: new Map(), expanded: new Set(), renaming: null }));
    } else {
      if (isWslKind(ws.type)) reportHealth(res.error.message);
      else errToast(res.error);
    }
  }, [errToast, reportHealth]);

  const rebuild = useCallback(async (ws: WorkspaceInfo) => {
    const bridge = getBridge();
    if (!bridge) return;
    // Quick-open index builds from directory.list, which is helper-backed
    // for WSL workspaces — no native-only gate here (§13, §18).
    const out: DirectoryEntry[] = [];
    const queue = [""];
    for (let i = 0; i < queue.length && out.length < 2000; i++) {
      const dir = queue[i]!;
      const res = await bridge.directory.list(ws.workspaceId, dir);
      if (!res.ok) break;
      for (const e of res.result) {
        if (e.kind === "directory") queue.push(e.relativePath);
        else if (e.fileClass === "markdown" || e.fileClass === "text") out.push(e);
      }
    }
    setAllFiles(out);
  }, []);

  /** Clear every workspace-scoped tree state (H5 teardown). The next open
   * repopulates via explicit loads; nothing from the old workspace lingers. */
  const resetTree = useCallback(() => {
    setEntries([]);
    setTree({ expanded: new Set(), children: new Map(), loading: new Set(), renaming: null, selected: null });
    setAllFiles([]);
    setCreating(null);
    setCreateName("");
    setSidebarLoading(false);
  }, []);

  const toggleDir = useCallback(async (dir: string) => {
    if (!workspace) return;
    const expanded = new Set(tree.expanded);
    if (expanded.has(dir)) {
      expanded.delete(dir);
      setTree((p) => ({ ...p, expanded }));
      return;
    }
    expanded.add(dir);
    if (!tree.children.has(dir)) {
      const loading = new Set(tree.loading).add(dir);
      setTree((p) => ({ ...p, expanded, loading }));
      const bridge = getBridge();
      if (!bridge) { setTree((p) => ({ ...p, expanded: new Set([...p.expanded].filter((d) => d !== dir)), loading: new Set() })); errToast({ code: "INTERNAL_ERROR", message: "Desktop bridge unavailable." }); return; }
      const res = await bridge.directory.list(workspace.workspaceId, dir);
      const loading2 = new Set(tree.loading);
      loading2.delete(dir);
      if (res.ok) {
        setTree((p) => ({ ...p, loading: loading2, children: new Map(p.children).set(dir, res.result) }));
      } else {
        expanded.delete(dir);
        setTree((p) => ({ ...p, expanded, loading: loading2 }));
        errToast(res.error);
      }
      return;
    }
    setTree((p) => ({ ...p, expanded }));
  }, [workspace, tree, errToast]);

  const beginCreate = useCallback((dir: string, folder: boolean) => {
    setCreating({ dir, folder });
    setCreateName("");
  }, []);

  const cancelCreate = useCallback(() => {
    setCreating(null);
    setCreateName("");
  }, []);

  const commitCreate = useCallback(async () => {
    if (!workspace || !creating || !createName.trim()) return;
    const ws = workspace;
    const creatingDir = creating.dir;
    const name = createName.trim();
    // Folders go through directory.create; notes through file.create (parents
    // created implicitly). Both refresh the tree when complete.
    const bridge = getBridge();
    if (!bridge) { errToast({ code: "INTERNAL_ERROR", message: "Desktop bridge unavailable." }); return; }
    if (creating.folder) {
      const rel = joinRel(creatingDir, name);
      const res = await bridge.directory.create(ws.workspaceId, rel);
      if (!res.ok) { errToast(res.error, `Couldn't create folder "${name}"`); return; }
      setCreating(null); setCreateName("");
      if (creatingDir) {
        const res2 = await bridge.directory.list(ws.workspaceId, creatingDir);
        if (res2.ok) setTree((p) => ({ ...p, children: new Map(p.children).set(creatingDir, res2.result) }));
      } else await refresh(ws);
      await rebuild(ws);
      return;
    }
    const rel = joinRel(creatingDir, name);
    const target = (/\.md$/i.test(rel) ? rel : `${rel}.md`);
    const res = await bridge.file.create(ws.workspaceId, target);
    if (!res.ok) { errToast(res.error, `Couldn't create "${target}"`); return; }
    // Created files are empty: index the blank entry with its revision.
    workspaceIndex.upsert(ws.workspaceId, target, "", res.result);
    bumpIndex();
    setCreating(null); setCreateName("");
    if (creatingDir) {
      const res2 = await bridge.directory.list(ws.workspaceId, creatingDir);
      if (res2.ok) setTree((p) => ({ ...p, children: new Map(p.children).set(creatingDir, res2.result) }));
    } else await refresh(ws);
    await rebuild(ws);
    await docs.openFile(target);
  }, [workspace, creating, createName, errToast, refresh, rebuild, docs, bumpIndex]);

  const commitRename = useCallback(async (entry: DirectoryEntry, newName: string) => {
    if (!workspace) return;
    const ws = workspace;
    const dir = parentDir(entry.relativePath);
    const newRel = joinRel(dir, newName);
    const bridge = getBridge();
    if (!bridge) { errToast({ code: "INTERNAL_ERROR", message: "Desktop bridge unavailable." }, "Couldn't rename"); setTree((p) => ({ ...p, renaming: null })); return; }
    // Auto-update off means rename-only: confirm first, then skip the
    // link rewrite server-side. Links pointing here go stale visibly.
    if (!autoUpdateLinks && !window.confirm(`Rename "${entry.name}" without updating links that point to it?`)) {
      setTree((p) => ({ ...p, renaming: null }));
      return;
    }
    // Folders rename through directory.rename; files through file.rename.
    const res = entry.kind === "directory"
      ? await bridge.directory.rename(ws.workspaceId, entry.relativePath, newRel, { autoUpdateLinks })
      : await bridge.file.rename(ws.workspaceId, entry.relativePath, newRel, { autoUpdateLinks });
    setTree((p) => ({ ...p, renaming: null }));
    if (!res.ok) { errToast(res.error, "Couldn't rename"); return; }
    // Rename remaps open keys in place: baselines survive the rename.
    docs.renameEntryDocs(ws.workspaceId, entry.relativePath, newRel);
    // Rename moves the index entry without re-parsing (bytes unchanged).
    if (entry.kind === "directory") workspaceIndex.movePrefix(ws.workspaceId, entry.relativePath, newRel);
    else workspaceIndex.move(ws.workspaceId, entry.relativePath, newRel);
    bumpIndex();
    if (dir) {
      const res2 = await bridge.directory.list(ws.workspaceId, dir);
      if (res2.ok) setTree((p) => ({ ...p, children: new Map(p.children).set(dir, res2.result) }));
    } else await refresh(ws);
    await rebuild(ws);
  }, [workspace, errToast, refresh, rebuild, docs, bumpIndex, autoUpdateLinks]);

  const deleteDirectory = useCallback(async (entry: DirectoryEntry) => {
    if (!workspace) return;
    const ws = workspace;
    // WSL folders delete permanently in P1 (helper `directory.delete`):
    // label it honestly, never as Recycle Bin trash.
    const wslDel = isWslKind(ws.type);
    if (confirmTrash && !window.confirm(wslDel ? `Permanently delete folder "${entry.name}"? This cannot be undone.` : `Delete folder "${entry.name}"?`)) return;
    const bridge = getBridge();
    if (!bridge) { errToast({ code: "INTERNAL_ERROR", message: "Desktop bridge unavailable." }, `Couldn't delete folder "${entry.name}"`); return; }
    const res = await bridge.directory.delete(ws.workspaceId, entry.relativePath);
    if (!res.ok) {
      // Non-empty folders need an explicit recursive confirm (no silent wipe).
      if (res.error.code === "DIRECTORY_NOT_EMPTY") {
        if (!window.confirm(`"${entry.name}" is not empty. Delete it and everything inside?`)) return;
        const res2 = await bridge.directory.delete(ws.workspaceId, entry.relativePath, true);
        if (!res2.ok) { errToast(res2.error, `Couldn't delete folder "${entry.name}"`); return; }
      } else {
        errToast(res.error, `Couldn't delete folder "${entry.name}"`);
        return;
      }
    }
    docs.removeEntryDocs(ws.workspaceId, entry.relativePath);
    // Folder delete drops the whole index prefix (exact + everything under).
    workspaceIndex.removePrefix(ws.workspaceId, entry.relativePath);
    bumpIndex();
    const dir = parentDir(entry.relativePath);
    if (dir) {
      const res2 = await bridge.directory.list(ws.workspaceId, dir);
      if (res2.ok) setTree((p) => ({ ...p, children: new Map(p.children).set(dir, res2.result) }));
    } else await refresh(ws);
    await rebuild(ws);
    toast(`Deleted folder "${entry.name}".`);
  }, [workspace, confirmTrash, errToast, toast, refresh, rebuild, docs, bumpIndex]);

  const trashEntry = useCallback(async (entry: DirectoryEntry) => {
    if (!workspace) return;
    const ws = workspace;
    // WSL delete is permanent-delete in P1 (helper `file.delete`): label it
    // honestly — never "Move to trash" / Recycle Bin for WSL workspaces.
    const wsl = isWslKind(ws.type);
    if (confirmTrash && !window.confirm(wsl ? `Permanently delete "${entry.name}"? This cannot be undone.` : `Move "${entry.name}" to trash?`)) return;
    const bridge = getBridge();
    if (!bridge) { errToast({ code: "INTERNAL_ERROR", message: "Desktop bridge unavailable." }); return; }
    const res = await bridge.file.trash(ws.workspaceId, entry.relativePath);
    if (!res.ok) { errToast(res.error, wsl ? `Couldn't delete "${entry.name}"` : undefined); return; }
    docs.removeEntryDocs(ws.workspaceId, entry.relativePath);
    workspaceIndex.removePrefix(ws.workspaceId, entry.relativePath);
    bumpIndex();
    const dir = parentDir(entry.relativePath);
    if (dir) {
      const res2 = await bridge.directory.list(ws.workspaceId, dir);
      if (res2.ok) setTree((p) => ({ ...p, children: new Map(p.children).set(dir, res2.result) }));
    } else await refresh(ws);
    await rebuild(ws);
    if (isWslKind(ws.type)) toast(`Permanently deleted "${entry.name}". This cannot be undone — WSL workspaces don't use the ${trashName(platform.platform)}.`);
    else toast(`Moved "${entry.name}" to trash. Recoverable from ${trashName(platform.platform)} — ${moveToTrashLabel(platform.platform)}.`);
  }, [workspace, confirmTrash, errToast, toast, refresh, rebuild, docs, bumpIndex, platform.platform]);

  const removeEntry = useCallback(async (entry: DirectoryEntry) => {
    // Folders delete through directory.delete; files move to OS trash.
    if (entry.kind === "directory") return deleteDirectory(entry);
    return trashEntry(entry);
  }, [deleteDirectory, trashEntry]);

  const select = useCallback((rel: string | null) => {
    setTree((p) => ({ ...p, selected: rel }));
  }, []);

  const beginRename = useCallback((rel: string) => {
    setTree((p) => ({ ...p, renaming: rel }));
  }, []);

  const cancelRename = useCallback(() => {
    setTree((p) => ({ ...p, renaming: null }));
  }, []);

  const selectedEntry = useMemo(() => {
    if (!tree.selected) return undefined;
    return entries.concat(...tree.children.values()).find((x) => x.relativePath === tree.selected);
  }, [entries, tree.children, tree.selected]);

  const preferredNewNoteDir = useCallback(() => {
    const sel = tree.selected;
    const isDir = sel && entries.concat(...tree.children.values()).some((e) => e.relativePath === sel && e.kind === "directory");
    return isDir ? sel : "";
  }, [tree.selected, tree.children, entries]);

  const createUntitledNote = useCallback(async (dir = preferredNewNoteDir()) => {
    if (!workspace) return;
    const ws = workspace;
    const bridge = getBridge();
    if (!bridge) { errToast({ code: "INTERNAL_ERROR", message: "Desktop bridge unavailable." }); return; }
    const existing = new Set(allFiles.map((f) => f.relativePath.toLowerCase()));
    let target = joinRel(dir, "Untitled.md");
    for (let i = 1; existing.has(target.toLowerCase()); i += 1) target = joinRel(dir, `Untitled ${i}.md`);
    let res = await bridge.file.create(ws.workspaceId, target);
    for (let i = 1; !res.ok && res.error.code === "ALREADY_EXISTS" && i < 100; i += 1) {
      target = joinRel(dir, `Untitled ${i}.md`);
      res = await bridge.file.create(ws.workspaceId, target);
    }
    if (!res.ok) { errToast(res.error, `Couldn't create "${target}"`); return; }
    workspaceIndex.upsert(ws.workspaceId, target, "", res.result);
    bumpIndex();
    if (dir) {
      const res2 = await bridge.directory.list(ws.workspaceId, dir);
      if (res2.ok) setTree((p) => ({ ...p, expanded: new Set(p.expanded).add(dir), children: new Map(p.children).set(dir, res2.result) }));
    } else await refresh(ws);
    await rebuild(ws);
    await docs.openFile(target);
  }, [workspace, allFiles, errToast, refresh, rebuild, docs, bumpIndex, preferredNewNoteDir]);

  // Step 7 Canvas: `Untitled.canvas` siblings next to notes. The file is
  // created empty, opened as a doc tab, then seeded with `{nodes:[],
  // edges:[]}` through the normal edit path — so dirty/autosave/CONFLICT
  // all apply and the index stays canvas-free via `syncFileIndex`.
  const createUntitledCanvas = useCallback(async (dir = preferredNewNoteDir()) => {
    if (!workspace) return;
    const ws = workspace;
    const bridge = getBridge();
    if (!bridge) { errToast({ code: "INTERNAL_ERROR", message: "Desktop bridge unavailable." }); return; }
    const known = new Set<string>();
    for (const e of entries) known.add(e.relativePath.toLowerCase());
    for (const kids of tree.children.values()) for (const e of kids) known.add(e.relativePath.toLowerCase());
    for (const f of allFiles) known.add(f.relativePath.toLowerCase());
    let target = joinRel(dir, "Untitled.canvas");
    for (let i = 1; known.has(target.toLowerCase()); i += 1) target = joinRel(dir, `Untitled ${i}.canvas`);
    let res = await bridge.file.create(ws.workspaceId, target);
    for (let i = 1; !res.ok && res.error.code === "ALREADY_EXISTS" && i < 100; i += 1) {
      target = joinRel(dir, `Untitled ${i}.canvas`);
      res = await bridge.file.create(ws.workspaceId, target);
    }
    if (!res.ok) { errToast(res.error, `Couldn't create "${target}"`); return; }
    if (dir) {
      const res2 = await bridge.directory.list(ws.workspaceId, dir);
      if (res2.ok) setTree((p) => ({ ...p, expanded: new Set(p.expanded).add(dir), children: new Map(p.children).set(dir, res2.result) }));
    } else await refresh(ws);
    await docs.openFile(target);
    const { serializeCanvasDoc, emptyCanvas } = await import("@takenotes/core/canvas/model");
    docs.onEdit(`${ws.workspaceId}:${target}`, serializeCanvasDoc(emptyCanvas()));
  }, [workspace, entries, tree.children, allFiles, errToast, refresh, docs, preferredNewNoteDir]);

  const visibleRows = useMemo(() => {
    const rows: DirectoryEntry[] = [];
    const walk = (list: DirectoryEntry[]): void => {
      for (const e of sortEntries(list, sort)) {
        rows.push(e);
        if (e.kind === "directory" && tree.expanded.has(e.relativePath)) {
          walk(tree.children.get(e.relativePath) ?? []);
        }
      }
    };
    walk(entries);
    return rows;
  }, [entries, tree.expanded, tree.children, sort]);

  const onTreeKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Step 9: arrows belong to the tree rows only — sort selects, search
    // fields, and rename inputs keep their native keys.
    const tag = (e.target as HTMLElement).tagName;
    if (tree.renaming || tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    const i = visibleRows.findIndex((r) => r.relativePath === tree.selected);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = e.key === "ArrowDown" ? Math.min(i + 1, visibleRows.length - 1) : Math.max(i - 1, 0);
      const row = visibleRows[n < 0 ? 0 : n];
      if (row) {
        setTree((p) => ({ ...p, selected: row.relativePath }));
        // Selection and DOM focus travel together (roving tabindex): the
        // row is focusable via tabIndex -1 even before it becomes the
        // Tab stop, so arrows never leave focus stranded behind.
        const target = document.querySelector<HTMLElement>(`[data-rel="${CSS.escape(row.relativePath)}"]`);
        target?.scrollIntoView({ block: "nearest" });
        target?.focus({ preventScroll: true });
      }
    } else if (e.key === "ArrowRight" && i >= 0) {
      const row = visibleRows[i]!;
      if (row.kind === "directory" && !tree.expanded.has(row.relativePath)) void toggleDir(row.relativePath);
    } else if (e.key === "ArrowLeft" && i >= 0) {
      const row = visibleRows[i]!;
      if (row.kind === "directory" && tree.expanded.has(row.relativePath)) void toggleDir(row.relativePath);
      else {
        const parent = parentDir(row.relativePath);
        if (parent) {
          setTree((p) => ({ ...p, selected: parent }));
          document.querySelector<HTMLElement>(`[data-rel="${CSS.escape(parent)}"]`)?.focus({ preventScroll: true });
        }
      }
    } else if (e.key === "Enter" && i >= 0) {
      const row = visibleRows[i]!;
      if (row.kind === "directory") void toggleDir(row.relativePath);
      else void docs.openFile(row.relativePath);
    }
  }, [tree.renaming, tree.selected, tree.expanded, visibleRows, toggleDir, docs]);

  /** Expand every ancestor (loading missing levels), then select. No scroll-steal. */
  const reveal = useCallback(async (rel: string) => {
    if (!workspace) { select(rel); return; }
    const bridge = getBridge();
    const ancestors = ancestorsOf(rel);
    if (bridge) {
      for (const dir of ancestors) {
        let has = false;
        setTree((p) => { has = p.expanded.has(dir) && p.children.has(dir); return p; });
        if (!has) {
          const res = await bridge.directory.list(workspace.workspaceId, dir);
          if (res.ok) {
            const kids = res.result;
            setTree((p) => ({ ...p, expanded: new Set(p.expanded).add(dir), children: new Map(p.children).set(dir, kids) }));
          } else {
            setTree((p) => ({ ...p, expanded: new Set(p.expanded).add(dir) }));
          }
        } else {
          setTree((p) => ({ ...p, expanded: new Set(p.expanded).add(dir) }));
        }
      }
    }
    setTree((p) => ({ ...p, selected: rel }));
  }, [workspace, select]);

  const expandAll = useCallback(async () => {
    if (!workspace) return;
    const bridge = getBridge();
    if (!bridge) return;
    const expanded = new Set<string>();
    const children = new Map<string, DirectoryEntry[]>();
    const queue = [""];
    const rootRes = await bridge.directory.list(workspace.workspaceId, "");
    if (rootRes.ok) {
      setEntries(rootRes.result);
      children.set("", rootRes.result);
    }
    // Seed queue from current root state (bounded like rebuild).
    const seed: DirectoryEntry[] = rootRes.ok ? rootRes.result : entries;
    for (const e of seed) if (e.kind === "directory") { queue.push(e.relativePath); expanded.add(e.relativePath); }
    for (let i = 0; i < queue.length && children.size < 2000; i++) {
      const dir = queue[i]!;
      if (dir === "") continue;
      if (children.has(dir)) {
        for (const e of children.get(dir) ?? []) {
          if (e.kind === "directory" && !expanded.has(e.relativePath)) { expanded.add(e.relativePath); queue.push(e.relativePath); }
        }
        continue;
      }
      const res = await bridge.directory.list(workspace.workspaceId, dir);
      if (!res.ok) continue;
      children.set(dir, res.result);
      for (const e of res.result) {
        if (e.kind === "directory" && !expanded.has(e.relativePath)) { expanded.add(e.relativePath); queue.push(e.relativePath); }
      }
    }
    setTree((p) => {
      const merged = new Map(p.children);
      for (const [k, v] of children) merged.set(k, v);
      return { ...p, expanded: new Set([...p.expanded, ...expanded]), children: merged };
    });
  }, [workspace, entries]);

  const collapseAll = useCallback(() => {
    setTree((p) => ({ ...p, expanded: new Set() }));
  }, []);

  // Sorted views: folders-first always; sort applies within kind.
  const sortedEntries = useMemo(() => sortEntries(entries, sort), [entries, sort]);
  const sortedTree = useMemo(() => {
    const children = new Map<string, DirectoryEntry[]>();
    for (const [k, v] of tree.children) children.set(k, sortEntries(v, sort));
    return { ...tree, children };
  }, [tree, sort]);

  return {
    entries: sortedEntries, allFiles, tree: sortedTree, sidebarLoading, creating, createName, setCreateName,
    refresh, rebuild, toggleDir, beginCreate, createUntitledNote, createUntitledCanvas, cancelCreate, commitCreate, commitRename,
    removeEntry, resetTree, select, beginRename, cancelRename, visibleRows, onTreeKeyDown,
    preferredNewNoteDir, selectedEntry, sort, setSort, reveal, expandAll, collapseAll,
  };
}
