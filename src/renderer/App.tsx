import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import type { DirectoryEntry, SearchMatch, WorkspaceInfo, WslDistribution } from "../shared/contracts/ipc";
import { usePlatform } from "./hooks/use-platform";
import { isWslKind, moveToTrashLabel, revealLabel, trashName } from "../shared/platform/filesystem";
import type { CommandId } from "../shared/platform/keymap";
import { useCodeMirrorEditor } from "./hooks/use-editor";
import { TitleBar, ActivityRail, StatusBar } from "./components/chrome";
import { FileTree, type TreeState } from "./components/tree";
import { SearchPanel, useDebouncedValue } from "./components/search";
import { ContextMenu, Toasts, TabStrip } from "./components/overlays";
import { CommandMenu, type CommandItem, type PaletteMode } from "./components/palette";
import { SettingsDialog } from "./components/settings";
import { Icon } from "./components/icons";
import { DEFAULT_SETTINGS, displayPath, fileName, joinRel, parentDir, type CtxMenu, type Settings, type TabState, type Toast } from "./components/types";

let toastId = 1;

/** Draft IPC guards: the dev loop rebuilds main/preload only on restart,
 *  so a hot-reloaded renderer can run against a stale main without draft
 *  handlers (or a stale preload without the `draft` bridge). Drafts are
 *  best-effort recovery data — their absence must never break file open,
 *  save, or spam unhandled rejections. All three helpers degrade to no-op. */
async function safeDraftGet(
  workspaceId: string,
  relativePath: string,
): Promise<{ content: string; baseRevisionHash: string; updatedAt: number; stale: boolean } | null> {
  try {
    const bridge = window.takenotes.draft;
    if (!bridge || typeof bridge.get !== "function") return null;
    const res = await bridge.get(workspaceId, relativePath);
    return res.ok ? res.result : null;
  } catch {
    return null;
  }
}

function safeDraftPut(args: { workspaceId: string; relativePath: string; baseRevisionHash: string; content: string }): void {
  try {
    const bridge = window.takenotes.draft;
    if (!bridge || typeof bridge.put !== "function") return;
    void bridge.put(args).catch(() => undefined);
  } catch {
    /* recovery-data only: never break editing */
  }
}

function safeDraftClear(workspaceId: string, relativePath: string): void {
  try {
    const bridge = window.takenotes.draft;
    if (!bridge || typeof bridge.clear !== "function") return;
    void bridge.clear(workspaceId, relativePath).catch(() => undefined);
  } catch {
    /* recovery-data only: never break saving */
  }
}

function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem("takenotes.settings") ?? "{}") };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export default function App(): JSX.Element {
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [tree, setTree] = useState<TreeState>({ expanded: new Set(), children: new Map(), loading: new Set(), renaming: null, selected: null });
  const [tabs, setTabs] = useState<TabState[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [view, setView] = useState<"files" | "search">("files");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem("takenotes.sidebarWidth") ?? 240) || 240);
  const [palette, setPalette] = useState<PaletteMode | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [menu, setMenu] = useState<CtxMenu>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filenameHits, setFilenameHits] = useState<SearchMatch[]>([]);
  const [contentHits, setContentHits] = useState<SearchMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [allFiles, setAllFiles] = useState<DirectoryEntry[]>([]);
  const [recents, setRecents] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("takenotes.recents") ?? "[]"); } catch { return []; } });
  const [recentWorkspaces, setRecentWorkspaces] = useState<{ name: string; kind: string }[]>(() => { try { return JSON.parse(localStorage.getItem("takenotes.recentWs") ?? "[]"); } catch { return []; } });
  const [recentCommands, setRecentCommands] = useState<string[]>([]);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [saveState, setSaveState] = useState<"clean" | "dirty" | "saving" | "saved" | "conflict" | "error">("clean");
  const [savedAt, setSavedAt] = useState<string>("");
  // Crash-recovery drafts (userData store, main process). Keyed by tab key.
  // This is RECOVERY data only: `Saved` is shown exclusively for bytes that
  // reached the note file. A persisted draft never flips the save indicator.
  const [recovery, setRecovery] = useState<Record<string, { content: string; updatedAt: number; stale: boolean; diskChanged: boolean }>>({});
  const [wslDialog, setWslDialog] = useState<{ distros: WslDistribution[]; distro: string; path: string; error: string | null; connecting: boolean } | null>(null);
  const [wslError, setWslError] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ dir: string; folder: boolean } | null>(null);
  const [createName, setCreateName] = useState("");
  const [version, setVersion] = useState("0.1.0");
  const [sidebarLoading, setSidebarLoading] = useState(false);
  const platform = usePlatform();
  const sc = (id: CommandId): string => platform.shortcutLabel(id);

  const activeTab = tabs.find((t) => t.key === activeKey) ?? null;
  const dragResize = useRef<{ startX: number; startW: number } | null>(null);

  /* ---------- helpers ---------- */
  const toast = useCallback((text: string, kind: Toast["kind"] = "info") => {
    const id = toastId++;
    setToasts((p) => [...p.slice(-3), { id, kind, text }]);
    if (kind === "info") setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 5000);
  }, []);

  useEffect(() => {
    localStorage.setItem("takenotes.settings", JSON.stringify(settings));
    const t = settings.theme;
    const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    const root = document.documentElement.style;
    root.setProperty("--editor-font-size", `${settings.fontSize}px`);
    root.setProperty("--editor-line-height", String(settings.lineHeight));
    root.setProperty("--editor-max-width", `${settings.readableWidth}px`);
    localStorage.setItem("takenotes.sidebarWidth", String(sidebarWidth));
  }, [settings, sidebarWidth]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (): void => {
      if (settings.theme === "system") document.documentElement.dataset.theme = mq.matches ? "dark" : "light";
    };
    mq.addEventListener("change", onChange);
    void window.takenotes.app.version().then((r) => { if (r.ok) setVersion(r.result); });
    return () => mq.removeEventListener("change", onChange);
  }, [settings.theme]);

  const refreshTree = useCallback(async (ws: WorkspaceInfo) => {
    setSidebarLoading(true);
    setWslError(null);
    const res = await window.takenotes.directory.list(ws.workspaceId, "");
    setSidebarLoading(false);
    if (res.ok) {
      setEntries(res.result);
      setTree((p) => ({ ...p, children: new Map(), expanded: new Set(), renaming: null }));
    } else {
      if (isWslKind(ws.type)) setWslError(res.error.message);
      else toast(res.error.message, "error");
    }
  }, [toast]);

  const rebuildAllFiles = useCallback(async (ws: WorkspaceInfo) => {
    // Quick-open index builds from directory.list, which is helper-backed
    // for WSL workspaces — no native-only gate here (§13, §18).
    const out: DirectoryEntry[] = [];
    const queue = [""];
    for (let i = 0; i < queue.length && out.length < 2000; i++) {
      const dir = queue[i]!;
      const res = await window.takenotes.directory.list(ws.workspaceId, dir);
      if (!res.ok) break;
      for (const e of res.result) {
        if (e.kind === "directory") queue.push(e.relativePath);
        else if (e.fileClass === "markdown" || e.fileClass === "text") out.push(e);
      }
    }
    setAllFiles(out);
  }, []);

  const openWorkspace = useCallback(async (ws: WorkspaceInfo) => {
    setWorkspace(ws);
    setTabs([]); setActiveKey(null); setSaveState("clean");
    setRecentWorkspaces((p) => {
      const next = [{ name: ws.displayName, kind: ws.type }, ...p.filter((r) => r.name !== ws.displayName)].slice(0, 8);
      localStorage.setItem("takenotes.recentWs", JSON.stringify(next));
      return next;
    });
    await refreshTree(ws);
    await rebuildAllFiles(ws);
  }, [refreshTree, rebuildAllFiles]);

  const openLocal = useCallback(async () => {
    const res = await window.takenotes.workspace.openLocal();
    if (!res.ok) { toast(res.error.message, "error"); return; }
    if (res.result) void openWorkspace(res.result);
  }, [openWorkspace, toast]);

  const openWslDialog = useCallback(async () => {
    const res = await window.takenotes.workspace.listWslDistributions();
    if (!res.ok) {
      setWslDialog({ distros: [], distro: "", path: "~/notes", error: res.error.message, connecting: false });
      return;
    }
    setWslDialog({ distros: res.result, distro: res.result[0]?.name ?? "", path: "~/notes", error: null, connecting: false });
  }, []);

  const connectWsl = useCallback(async () => {
    if (!wslDialog || !wslDialog.distro) return;
    setWslDialog({ ...wslDialog, connecting: true, error: null });
    const res = await window.takenotes.workspace.connectWsl(wslDialog.distro, wslDialog.path || "~/notes");
    setWslDialog({ ...wslDialog, connecting: false, error: res.ok ? null : res.error.message });
    if (res.ok) {
      setWslDialog(null);
      toast(`Connecting to ${wslDialog.distro}…`);
      await openWorkspace(res.result);
    }
  }, [wslDialog, openWorkspace, toast]);

  const openFile = useCallback(async (relativePath: string) => {
    if (!workspace) return;
    const key = `${workspace.workspaceId}:${relativePath}`;
    const existing = tabs.find((t) => t.key === key);
    if (existing) {
      setActiveKey(key);
      setSaveState(existing.conflict ? "conflict" : existing.dirty ? "dirty" : "clean");
      return;
    }
    // Recovery draft check runs alongside the read (paths only, never contents, in logs).
    // safeDraftGet degrades to null against a stale main/preload without draft support.
    const [res, draft] = await Promise.all([
      window.takenotes.file.read(workspace.workspaceId, relativePath),
      safeDraftGet(workspace.workspaceId, relativePath),
    ]);
    if (!res.ok) {
      // Trace the full read chain (renderer → IPC → supervisor → helper).
      // Paths only, never contents.
      console.error("[file-read] open failed", {
        workspaceId: workspace.workspaceId,
        workspaceType: workspace.type,
        relativePath,
        code: res.error.code,
        message: res.error.message,
      });
      if ((res.error.code === "NOT_FOUND" || res.error.code === "INVALID_PATH") && draft && draft.content) {
        // File deleted/moved externally: retain the draft as an unsaved tab.
        // The note file is untouched (it is already gone); nothing is written.
        setTabs((p) => [...p, { key, relativePath, content: draft.content, dirty: true, revisionHash: "", newlineStyle: "lf", hadBom: false, conflict: false, loadError: null }]);
        setActiveKey(key);
        setSaveState("dirty");
        setRecovery((p) => ({ ...p, [key]: { content: draft.content, updatedAt: draft.updatedAt, stale: draft.stale, diskChanged: true } }));
        toast("The original file is gone. Your unsaved draft was retained — save it to keep it.", "error");
        return;
      }
      if (res.error.code === "TOO_LARGE" || res.error.code === "UNSUPPORTED_ENCODING") {
        setTabs((p) => [...p, { key, relativePath, content: "", dirty: false, revisionHash: "", newlineStyle: "lf", hadBom: false, conflict: false, loadError: res.error.message }]);
        setActiveKey(key);
      } else toast(res.error.message, "error");
      return;
    }
    const file = res.result;
    setTabs((p) => [...p, { key, relativePath, content: file.content, dirty: false, revisionHash: file.revision.hash, newlineStyle: file.newlineStyle, hadBom: file.hadBom, conflict: false, loadError: null }]);
    setActiveKey(key);
    setSaveState("clean");
    setCursor({ line: 1, col: 1 });
    if (draft && draft.content !== file.content) {
      // A recovery draft exists and differs from disk: never auto-apply.
      // baseRevisionHash === current disk hash → disk unchanged since the
      // draft was taken → offer restore. Otherwise BOTH are kept and the
      // user chooses explicitly (reload-from-disk vs restore-draft).
      setRecovery((p) => ({
        ...p,
        [key]: { content: draft.content, updatedAt: draft.updatedAt, stale: draft.stale, diskChanged: draft.baseRevisionHash !== file.revision.hash },
      }));
    } else if (draft) {
      // Draft matches disk: nothing to recover; drop it silently.
      safeDraftClear(workspace.workspaceId, relativePath);
    }
    setRecents((p) => {
      const next = [relativePath, ...p.filter((r) => r !== relativePath)].slice(0, 20);
      localStorage.setItem("takenotes.recents", JSON.stringify(next));
      return next;
    });
  }, [workspace, tabs, toast]);

  const onEdit = useCallback((content: string) => {
    if (!activeKey) return;
    setTabs((p) => p.map((t) => (t.key === activeKey ? { ...t, content, dirty: true } : t)));
    setSaveState("dirty");
  }, [activeKey]);

  const save = useCallback(async () => {
    if (!workspace || !activeTab || activeTab.loadError) return;
    setSaveState("saving");
    const res = await window.takenotes.file.write({
      workspaceId: workspace.workspaceId,
      relativePath: activeTab.relativePath,
      content: activeTab.content,
      expectedHash: activeTab.revisionHash,
      newlineStyle: activeTab.newlineStyle,
      hadBom: activeTab.hadBom,
    });
    if (!res.ok) {
      if (res.error.code === "CONFLICT") {
        setTabs((p) => p.map((t) => (t.key === activeTab.key ? { ...t, conflict: true } : t)));
        setSaveState("conflict");
      } else {
        setSaveState("error");
        toast(`Couldn't save ${fileName(activeTab.relativePath)} — ${res.error.message} Your edits are still safe.`, "error");
      }
      return;
    }
    setTabs((p) => p.map((t) => (t.key === activeTab.key ? { ...t, dirty: false, conflict: false, revisionHash: res.result.hash } : t)));
    setSaveState("saved");
    setSavedAt(new Date().toLocaleTimeString());
    // The file now holds the truth: the recovery draft is obsolete.
    setRecovery((p) => {
      if (!(activeTab.key in p)) return p;
      const next = { ...p };
      delete next[activeTab.key];
      return next;
    });
    safeDraftClear(workspace.workspaceId, activeTab.relativePath);
    void rebuildAllFiles(workspace);
  }, [workspace, activeTab, toast, rebuildAllFiles]);

  const reloadFromDisk = useCallback(async () => {
    if (!workspace || !activeTab) return;
    console.error("[file-read] reload request", {
      workspaceId: workspace.workspaceId,
      workspaceType: workspace.type,
      relativePath: activeTab.relativePath,
    });
    const res = await window.takenotes.file.read(workspace.workspaceId, activeTab.relativePath);
    if (!res.ok) {
      console.error("[file-read] reload failed", {
        workspaceId: workspace.workspaceId,
        workspaceType: workspace.type,
        relativePath: activeTab.relativePath,
        code: res.error.code,
        message: res.error.message,
      });
      toast(res.error.message, "error"); return; }
    setTabs((p) => p.map((t) => (t.key === activeTab.key ? { ...t, content: res.result.content, dirty: false, conflict: false, revisionHash: res.result.revision.hash } : t)));
    setSaveState("clean");
  }, [workspace, activeTab, toast]);

  const keepMyVersion = useCallback(async () => {
    if (!workspace || !activeTab) return;
    const res = await window.takenotes.file.read(workspace.workspaceId, activeTab.relativePath);
    if (!res.ok) { toast(res.error.message, "error"); return; }
    const diskHash = res.result.revision.hash;
    const res2 = await window.takenotes.file.write({
      workspaceId: workspace.workspaceId, relativePath: activeTab.relativePath, content: activeTab.content,
      expectedHash: diskHash, newlineStyle: activeTab.newlineStyle, hadBom: activeTab.hadBom,
    });
    if (!res2.ok) { toast(res2.error.message, "error"); return; }
    setTabs((p) => p.map((t) => (t.key === activeTab.key ? { ...t, dirty: false, conflict: false, revisionHash: res2.result.hash } : t)));
    setSaveState("saved");
  }, [workspace, activeTab, toast]);

  const closeTab = useCallback((key: string) => {
    // Closing a tab does NOT delete its recovery draft: a quit-with-dirty
    // followed by a restart must still offer recovery. Drafts die on save
    // (draft:clear) or explicit Discard in the recovery banner.
    setTabs((p) => {
      const i = p.findIndex((t) => t.key === key);
      const next = p.filter((t) => t.key !== key);
      if (key === activeKey) {
        const nb = next[Math.min(i, next.length - 1)];
        setActiveKey(nb ? nb.key : null);
        setSaveState(nb ? (nb.conflict ? "conflict" : nb.dirty ? "dirty" : "clean") : "clean");
      }
      return next;
    });
  }, [activeKey]);

  /* ---------- crash-recovery drafts ---------- */
  // Debounced (750 ms): keystroke bursts collapse into one main-process
  // write. The indicator stays `Unsaved changes`-style dirty — a persisted
  // draft never displays `Saved`.
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (draftTimer.current) {
      clearTimeout(draftTimer.current);
      draftTimer.current = null;
    }
    if (!workspace || !activeTab || !activeTab.dirty || activeTab.loadError || !activeTab.revisionHash) return;
    const wsId = workspace.workspaceId;
    const rel = activeTab.relativePath;
    const content = activeTab.content;
    const base = activeTab.revisionHash;
    draftTimer.current = setTimeout(() => {
      draftTimer.current = null;
      safeDraftPut({ workspaceId: wsId, relativePath: rel, baseRevisionHash: base, content });
    }, 750);
    return () => {
      if (draftTimer.current) {
        clearTimeout(draftTimer.current);
        draftTimer.current = null;
      }
    };
  }, [workspace, activeTab?.key, activeTab?.content, activeTab?.dirty]);

  // Best effort: persist dirty tabs synchronously on unload (debounce may not have fired).
  useEffect(() => {
    const onUnload = (): void => {
      if (draftTimer.current) {
        clearTimeout(draftTimer.current);
        draftTimer.current = null;
      }
      if (workspace && activeTab?.dirty && !activeTab.loadError && activeTab.revisionHash) {
        safeDraftPut({
          workspaceId: workspace.workspaceId,
          relativePath: activeTab.relativePath,
          baseRevisionHash: activeTab.revisionHash,
          content: activeTab.content,
        });
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [workspace, activeTab]);

  const restoreDraft = useCallback((key: string) => {
    const rec = recovery[key];
    if (!rec) return;
    setTabs((tabs) => tabs.map((t) => (t.key === key ? { ...t, content: rec.content, dirty: true } : t)));
    setSaveState("dirty");
  }, [recovery]);

  const discardDraft = useCallback((key: string) => {
    if (!workspace) return;
    const tab = tabs.find((t) => t.key === key);
    if (tab) safeDraftClear(workspace.workspaceId, tab.relativePath);
    setRecovery((p) => {
      const next = { ...p };
      delete next[key];
      return next;
    });
  }, [workspace, tabs]);

  /* ---------- tree ops ---------- */
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
      const res = await window.takenotes.directory.list(workspace.workspaceId, dir);
      const loading2 = new Set(tree.loading);
      loading2.delete(dir);
      if (res.ok) {
        setTree((p) => ({ ...p, loading: loading2, children: new Map(p.children).set(dir, res.result) }));
      } else {
        expanded.delete(dir);
        setTree((p) => ({ ...p, expanded, loading: loading2 }));
        toast(res.error.message, "error");
      }
      return;
    }
    setTree((p) => ({ ...p, expanded }));
  }, [workspace, tree, toast]);

  const commitCreate = useCallback(async () => {
    if (!workspace || !creating || !createName.trim()) return;
    const name = createName.trim();
    const rel = joinRel(creating.dir, name);
    const target = creating.folder ? joinRel(rel, "untitled.md") : (/\.md$/i.test(rel) ? rel : `${rel}.md`);
    const res = await window.takenotes.file.create(workspace.workspaceId, target);
    if (!res.ok) { toast(res.error.message, "error"); return; }
    setCreating(null); setCreateName("");
    if (creating.dir) {
      const res2 = await window.takenotes.directory.list(workspace.workspaceId, creating.dir);
      if (res2.ok) setTree((p) => ({ ...p, children: new Map(p.children).set(creating.dir, res2.result) }));
    } else await refreshTree(workspace);
    await rebuildAllFiles(workspace);
    await openFile(target);
  }, [workspace, creating, createName, toast, refreshTree, rebuildAllFiles, openFile]);

  const commitRename = useCallback(async (entry: DirectoryEntry, newName: string) => {
    if (!workspace) return;
    const dir = parentDir(entry.relativePath);
    const newRel = joinRel(dir, newName);
    const res = await window.takenotes.file.rename(workspace.workspaceId, entry.relativePath, newRel);
    setTree((p) => ({ ...p, renaming: null }));
    if (!res.ok) { toast(res.error.message, "error"); return; }
    setTabs((p) => p.map((t) => {
      if (t.relativePath !== entry.relativePath && !t.relativePath.startsWith(`${entry.relativePath}/`)) return t;
      const suffix = t.relativePath.slice(entry.relativePath.length);
      const nr = newRel + suffix;
      return { ...t, key: `${workspace.workspaceId}:${nr}`, relativePath: nr };
    }));
    if (dir) {
      const res2 = await window.takenotes.directory.list(workspace.workspaceId, dir);
      if (res2.ok) setTree((p) => ({ ...p, children: new Map(p.children).set(dir, res2.result) }));
    } else await refreshTree(workspace);
    await rebuildAllFiles(workspace);
  }, [workspace, toast, refreshTree, rebuildAllFiles]);

  const trashEntry = useCallback(async (entry: DirectoryEntry) => {
    if (!workspace) return;
    if (settings.confirmTrash && !window.confirm(`Move "${entry.name}" to trash?`)) return;
    const res = await window.takenotes.file.trash(workspace.workspaceId, entry.relativePath);
    if (!res.ok) { toast(res.error.message, "error"); return; }
    setTabs((p) => p.filter((t) => t.relativePath !== entry.relativePath && !t.relativePath.startsWith(`${entry.relativePath}/`)));
    const dir = parentDir(entry.relativePath);
    if (dir) {
      const res2 = await window.takenotes.directory.list(workspace.workspaceId, dir);
      if (res2.ok) setTree((p) => ({ ...p, children: new Map(p.children).set(dir, res2.result) }));
    } else await refreshTree(workspace);
    await rebuildAllFiles(workspace);
    toast(`Moved "${entry.name}" to trash. Recoverable from ${trashName(platform.platform)} — ${moveToTrashLabel(platform.platform)}.`);
  }, [workspace, settings.confirmTrash, toast, refreshTree, rebuildAllFiles]);

  /* ---------- search ---------- */
  const debouncedQuery = useDebouncedValue(searchQuery, 250);
  useEffect(() => {
    if (!workspace || !debouncedQuery.trim()) {
      setFilenameHits([]); setContentHits([]); setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    void (async () => {
      const q = debouncedQuery.trim();
      const [f, c] = await Promise.all([
        window.takenotes.search.files(workspace.workspaceId, q),
        window.takenotes.search.content(workspace.workspaceId, q),
      ]);
      if (cancelled) return;
      setSearching(false);
      setFilenameHits(f.ok ? f.result.slice(0, 20) : []);
      setContentHits(c.ok ? c.result.slice(0, 60) : []);
    })();
    return () => { cancelled = true; };
  }, [debouncedQuery, workspace]);

  /* ---------- commands ---------- */
  const runCommand = useCallback((id: string) => {
    setRecentCommands((p) => [id, ...p.filter((c) => c !== id)].slice(0, 10));
  }, []);

  const newNote = useCallback(() => {
    runCommand("new-note");
    if (!workspace) { void openLocal(); return; }
    const sel = tree.selected;
    const dir = sel && entries.concat(...tree.children.values()).some((e) => e.relativePath === sel && e.kind === "directory") ? sel : "";
    setView("files"); setSidebarOpen(true);
    setCreating({ dir, folder: false }); setCreateName("");
  }, [workspace, openLocal, tree.selected, tree.children, entries, runCommand]);

  /* Semantic command table. Shortcut labels come from the platform registry
   * (§117–§119): never hardcode `Ctrl+P` in shared components. WSL entries
   * only exist where the capability exists (§185). */
  const commands: CommandItem[] = useMemo(() => {
    const items: CommandItem[] = [
      { id: "file.new", title: "Create new note", shortcut: sc("file.new"), run: () => newNote() },
      { id: "file.save", title: "Save current file", shortcut: sc("file.save"), run: () => void save() },
      { id: "file.quickOpen", title: "Quick open…", shortcut: sc("file.quickOpen"), run: () => setPalette({ kind: "quick" }) },
      { id: "workspace.openLocal", title: "Open folder…", run: () => void openLocal() },
      { id: "view.toggleSidebar", title: "Toggle sidebar", shortcut: sc("view.toggleSidebar"), run: () => setSidebarOpen((v) => !v) },
      { id: "view.toggleFocus", title: "Toggle focus mode", shortcut: sc("view.toggleFocus"), run: () => setFocusMode((v) => !v) },
      { id: "view.fullWidth", title: "Toggle full-width editor", run: () => setSettings((s) => ({ ...s, fullWidth: !s.fullWidth })) },
      { id: "file.closeTab", title: "Close current tab", shortcut: sc("file.closeTab"), run: () => { if (activeKey) closeTab(activeKey); } },
      { id: "workspace.refresh", title: "Refresh file tree", run: () => { if (workspace) { void refreshTree(workspace); void rebuildAllFiles(workspace); } } },
      { id: "settings.open", title: "Open settings", shortcut: sc("settings.open"), run: () => setSettingsOpen(true) },
    ];
    if (platform.capabilities.wsl) {
      items.splice(4, 0, { id: "workspace.openWsl", title: "Open WSL folder…", run: () => void openWslDialog() });
    }
    return items;
  }, [newNote, save, openLocal, openWslDialog, activeKey, closeTab, workspace, refreshTree, rebuildAllFiles, sc, platform.capabilities.wsl]);

  /* Native menu → same command dispatch (§59). Menu accelerators and the
   * palette forward CommandIds here; mouse and keyboard share one path. */
  useEffect(() => {
    const off = window.takenotes.events.onCommand((id: CommandId) => {
      switch (id) {
        case "file.new": newNote(); break;
        case "file.save": void save(); break;
        case "file.quickOpen": setPalette({ kind: "quick" }); break;
        case "file.closeTab": if (activeKey) closeTab(activeKey); break;
        case "commandPalette.open": setPalette({ kind: "commands" }); break;
        case "workspace.search": setView("search"); setSidebarOpen(true); break;
        case "editor.find": break; // CodeMirror search keymap owns editor find (§58)
        case "settings.open": setSettingsOpen(true); break;
        case "view.toggleSidebar": setSidebarOpen((v) => !v); break;
        case "view.toggleFocus": setFocusMode((v) => !v); break;
        case "file.closeWindow": window.close(); break;
        default: break;
      }
    });
    return off;
  }, [newNote, save, activeKey, closeTab]);

  /* ---------- global keyboard ---------- */
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
      if (palette) {
        if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); void save(); }
        return;
      }
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); void save(); return; }
      if (mod && e.key.toLowerCase() === "p" && e.shiftKey) { e.preventDefault(); setPalette({ kind: "commands" }); return; }
      if (mod && e.key.toLowerCase() === "p") { e.preventDefault(); setPalette({ kind: "quick" }); return; }
      if (mod && e.key.toLowerCase() === "n") { e.preventDefault(); newNote(); return; }
      if (mod && e.key.toLowerCase() === "w") { e.preventDefault(); if (activeKey) closeTab(activeKey); return; }
      if (mod && e.key === "\\") { e.preventDefault(); setSidebarOpen((v) => !v); return; }
      if (mod && e.key.toLowerCase() === ",") { e.preventDefault(); setSettingsOpen(true); return; }
      if (mod && e.key === ".") { e.preventDefault(); setFocusMode((v) => !v); return; }
      if (mod && e.key === "Tab") {
        e.preventDefault();
        setTabs((p) => {
          if (p.length < 2 || !activeKey) return p;
          const i = p.findIndex((t) => t.key === activeKey);
          const n = p[(i + (e.shiftKey ? p.length - 1 : 1)) % p.length]!;
          setActiveKey(n.key);
          return p;
        });
        return;
      }
      // Tree rename/trash follow platform convention (§43–§44): F2 + Delete
      // on Windows/Linux; Command+Backspace on macOS. Palette + context
      // menu stay universal fallbacks on every OS (§44, §155).
      const isMacTree = platform.platform === "macos";
      if (!isMacTree && e.key === "F2" && tree.selected && !inField(e.target)) {
        e.preventDefault();
        const sel = tree.selected;
        const found = entries.concat(...tree.children.values()).find((x) => x.relativePath === sel);
        if (found) setTree((p) => ({ ...p, renaming: sel }));
        return;
      }
      if (!isMacTree && e.key === "Delete" && tree.selected && !inField(e.target)) {
        const sel = tree.selected;
        const found = entries.concat(...tree.children.values()).find((x) => x.relativePath === sel);
        if (found) { e.preventDefault(); void trashEntry(found); }
        return;
      }
      if (isMacTree && e.metaKey && e.key === "Backspace" && tree.selected && !inField(e.target)) {
        const sel = tree.selected;
        const found = entries.concat(...tree.children.values()).find((x) => x.relativePath === sel);
        if (found) { e.preventDefault(); void trashEntry(found); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, newNote, activeKey, closeTab, tree.selected, tree.children, entries, trashEntry, palette, platform.platform]);

  /* tree arrow navigation */
  const visibleRows = useMemo(() => {
    const rows: DirectoryEntry[] = [];
    const walk = (list: DirectoryEntry[]): void => {
      for (const e of list) {
        rows.push(e);
        if (e.kind === "directory" && tree.expanded.has(e.relativePath)) {
          walk(tree.children.get(e.relativePath) ?? []);
        }
      }
    };
    walk(entries);
    return rows;
  }, [entries, tree.expanded, tree.children]);

  const onTreeKeyDown = (e: React.KeyboardEvent): void => {
    if (tree.renaming || (e.target as HTMLElement).tagName === "INPUT") return;
    const i = visibleRows.findIndex((r) => r.relativePath === tree.selected);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = e.key === "ArrowDown" ? Math.min(i + 1, visibleRows.length - 1) : Math.max(i - 1, 0);
      const row = visibleRows[n < 0 ? 0 : n];
      if (row) {
        setTree((p) => ({ ...p, selected: row.relativePath }));
        document.querySelector(`[data-rel="${CSS.escape(row.relativePath)}"]`)?.scrollIntoView({ block: "nearest" });
      }
    } else if (e.key === "ArrowRight" && i >= 0) {
      const row = visibleRows[i]!;
      if (row.kind === "directory" && !tree.expanded.has(row.relativePath)) void toggleDir(row.relativePath);
    } else if (e.key === "ArrowLeft" && i >= 0) {
      const row = visibleRows[i]!;
      if (row.kind === "directory" && tree.expanded.has(row.relativePath)) void toggleDir(row.relativePath);
      else {
        const parent = parentDir(row.relativePath);
        if (parent) setTree((p) => ({ ...p, selected: parent }));
      }
    } else if (e.key === "Enter" && i >= 0) {
      const row = visibleRows[i]!;
      if (row.kind === "directory") void toggleDir(row.relativePath);
      else void openFile(row.relativePath);
    }
  };

  /* ---------- context menus ---------- */
  const fileMenu = (e: React.MouseEvent, entry: DirectoryEntry): void => {
    e.preventDefault(); e.stopPropagation();
    const openable = entry.kind !== "directory" && (entry.fileClass === "markdown" || entry.fileClass === "text");
    setTree((p) => ({ ...p, selected: entry.relativePath }));
    setMenu({
      x: e.clientX, y: e.clientY,
      items: entry.kind === "directory" ? [
        { label: "New note here", run: () => { setCreating({ dir: entry.relativePath, folder: false }); setCreateName(""); } },
        { label: "New folder…", run: () => { setCreating({ dir: entry.relativePath, folder: true }); setCreateName(""); } },
        { label: "---", run: () => undefined },
        { label: "Rename", shortcut: sc("tree.rename"), run: () => setTree((p) => ({ ...p, renaming: entry.relativePath })) },
        { label: "Copy relative path", run: () => void navigator.clipboard.writeText(displayPath(entry.relativePath)) },
        { label: revealLabel(platform.platform), run: () => void window.takenotes.shell.reveal(workspace!.workspaceId, entry.relativePath) },
        { label: "---", run: () => undefined },
        { label: moveToTrashLabel(platform.platform), danger: true, run: () => void trashEntry(entry) },
      ] : [
        { label: "Open", run: () => void openFile(entry.relativePath), disabled: !openable },
        { label: "Rename", shortcut: sc("tree.rename"), run: () => setTree((p) => ({ ...p, renaming: entry.relativePath })) },
        { label: "Copy relative path", run: () => void navigator.clipboard.writeText(displayPath(entry.relativePath)) },
        { label: revealLabel(platform.platform), run: () => void window.takenotes.shell.reveal(workspace!.workspaceId, entry.relativePath) },
        { label: "---", run: () => undefined },
        { label: moveToTrashLabel(platform.platform), shortcut: sc("tree.trash"), danger: true, run: () => void trashEntry(entry) },
      ],
    });
  };

  const tabMenu = (e: React.MouseEvent, key: string): void => {
    e.preventDefault();
    setMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: "Close", shortcut: sc("file.closeTab"), run: () => closeTab(key) },
        { label: "Close others", run: () => { setTabs((p) => p.filter((t) => t.key === key)); setActiveKey(key); } },
        { label: "Close to the right", run: () => {
          setTabs((p) => { const i = p.findIndex((t) => t.key === key); return p.filter((_, j) => j <= i); });
          if (activeKey && !tabs.slice(0, tabs.findIndex((t) => t.key === key) + 1).some((t) => t.key === activeKey)) setActiveKey(key);
        } },
      ],
    });
  };

  /* ---------- editor ---------- */
  const sessionKey = activeTab ? `${activeTab.key}|ln${settings.lineNumbers ? 1 : 0}|ww${settings.wordWrap ? 1 : 0}` : "none";
  const contentRef = useRef("");
  contentRef.current = activeTab?.content ?? "";
  const editorRef = useCodeMirrorEditor(sessionKey, contentRef.current, {
    lineNumbers: settings.lineNumbers,
    wordWrap: settings.wordWrap,
    onChange: onEdit,
    onCursor: (line, col) => setCursor((p) => (p.line === line && p.col === col ? p : { line, col })),
  });

  const words = useMemo(() => {
    const c = activeTab?.content.trim() ?? "";
    return c ? c.split(/\s+/).length : 0;
  }, [activeTab?.content]);

  const saveLabel = saveState === "saved" ? `Saved${savedAt ? ` ${savedAt}` : ""}` : saveState;

  /* ---------- render ---------- */
  if (!workspace) {
    return (
      <div className="app">
        <TitleBar workspace={null} platform={platform} onQuickOpen={() => {}} onOpenWindows={() => void openLocal()} onOpenWsl={() => void openWslDialog()} />
        <div className="empty">
          <h1>Desktop Notes</h1>
          <p>Open your notes</p>
          <div className="actions">
            <button className="btn primary" onClick={() => void openLocal()}>Open folder</button>
            {platform.capabilities.wsl && (
              <button className="btn" onClick={() => void openWslDialog()}>Open WSL folder</button>
            )}
          </div>
          <p className="hint">Your notes stay where they are. Desktop Notes works directly with Markdown files.</p>
          {recentWorkspaces.length > 0 && (
            <>
              <hr className="sect-sep" />
              <div className="recent-list">
                <div className="panel-title" style={{ paddingLeft: 12 }}>Recent</div>
                {recentWorkspaces.map((r) => (
                  <button key={r.name} className="recent-item" onClick={() => void openLocal()} title="Reopen via folder picker">
                    <span className="n">{r.name}</span>
                    <span className="d">{r.kind === "windows-wsl" ? "WSL" : r.kind === "macos-local" ? "macOS" : r.kind === "linux-local" ? "Linux" : "Windows"}</span>
                  </button>
                ))}
                <button className="recent-item" onClick={() => void openLocal()}><span className="n" style={{ color: "var(--accent)" }}>Open other folder…</span></button>
              </div>
            </>
          )}
        </div>
        {wslDialog && <WslDialog dialog={wslDialog} onChange={setWslDialog} onConnect={connectWsl} onClose={() => setWslDialog(null)} />}
        <Toasts toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />
      </div>
    );
  }

  return (
    <div className="app">
      {!focusMode && (
        <TitleBar workspace={workspace} platform={platform} onQuickOpen={() => setPalette({ kind: "quick" })} onOpenWindows={() => void openLocal()} onOpenWsl={() => void openWslDialog()} />
      )}
      <div className="body">
        {!focusMode && (
          <ActivityRail view={view} platform={platform} onView={(v) => { setView(v); setSidebarOpen(true); }} onSettings={() => setSettingsOpen(true)} />
        )}
        {!focusMode && sidebarOpen && (
          <>
            <aside className="sidebar" style={{ width: Math.min(360, Math.max(180, sidebarWidth)) }} aria-label="Sidebar">
              <div className="sidebar-head" title={workspace.displayName}>
                <span className="name">{workspace.displayName}
                  {isWslKind(workspace.type) && <span className="sub">WSL</span>}
                </span>
                <button className="icon-btn" title={`New note (${sc("file.new")})`} aria-label="New note" onClick={newNote}><Icon name="plus" /></button>
                <button
                  className="icon-btn" title="More actions" aria-label="More actions"
                  onClick={(e) => setMenu({
                    x: e.clientX, y: e.clientY,
                    items: [
                      { label: "New note", shortcut: sc("file.new"), run: () => newNote() },
                      { label: "New folder…", run: () => { setCreating({ dir: "", folder: true }); setCreateName(""); } },
                      { label: "---", run: () => undefined },
                      { label: "Refresh file tree", run: () => { void refreshTree(workspace); void rebuildAllFiles(workspace); } },
                      { label: "Open another folder…", run: () => void openLocal() },
                    ],
                  })}
                ><Icon name="more" /></button>
              </div>
              <div className="sidebar-body" onKeyDown={onTreeKeyDown}>
                {view === "files" ? (
                  <>
                    {creating && (
                      <div className="tree-row" style={{ paddingLeft: 8 }}>
                        <input
                          className="rename-input"
                          autoFocus
                          placeholder={creating.folder ? "folder-name" : "note-name"}
                          value={createName}
                          aria-label={creating.folder ? "New folder name" : "New note name"}
                          onChange={(e) => setCreateName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void commitCreate();
                            else if (e.key === "Escape") { setCreating(null); setCreateName(""); }
                            e.stopPropagation();
                          }}
                          onBlur={() => { if (createName.trim()) void commitCreate(); else { setCreating(null); setCreateName(""); } }}
                        />
                      </div>
                    )}
                    {sidebarLoading ? (
                      <div className="panel-title">Opening…</div>
                    ) : wslError ? (
                      <div style={{ padding: 12 }}>
                        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Couldn&apos;t list this workspace.</p>
                        <p className="inline-error">{wslError}</p>
                      </div>
                    ) : (
                      <FileTree
                        entries={entries}
                        tree={tree}
                        activePath={activeTab?.relativePath ?? null}
                        onToggle={(d) => void toggleDir(d)}
                        onOpen={(en) => {
                          if (en.fileClass === "markdown" || en.fileClass === "text") void openFile(en.relativePath);
                          else toast("Only Markdown and text files open in the editor in this MVP.");
                        }}
                        onSelect={(rel) => setTree((p) => ({ ...p, selected: rel }))}
                        onContext={fileMenu}
                        onRenameCommit={(en, n) => void commitRename(en, n)}
                        onRenameCancel={() => setTree((p) => ({ ...p, renaming: null }))}
                      />
                    )}
                  </>
                ) : (
                  <SearchPanel
                    query={searchQuery}
                    onQuery={setSearchQuery}
                    searching={searching}
                    filenameHits={filenameHits}
                    contentHits={contentHits}
                    onOpen={(rel, line) => {
                      void openFile(rel).then(() => {
                        if (line) toast(`Jumped to line ${line}. In-editor scroll lands with Stage 7.`);
                      });
                    }}
                  />
                )}
              </div>
            </aside>
            <div
              className="resize-handle"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
              onMouseDown={(e) => {
                dragResize.current = { startX: e.clientX, startW: sidebarWidth };
                const onMove = (ev: MouseEvent): void => {
                  if (!dragResize.current) return;
                  setSidebarWidth(Math.min(360, Math.max(180, dragResize.current.startW + ev.clientX - dragResize.current.startX)));
                };
                const onUp = (): void => {
                  dragResize.current = null;
                  window.removeEventListener("mousemove", onMove);
                  window.removeEventListener("mouseup", onUp);
                };
                window.addEventListener("mousemove", onMove);
                window.addEventListener("mouseup", onUp);
              }}
              onDoubleClick={() => setSidebarWidth(240)}
            />
          </>
        )}
        <main className="main">
          {!focusMode && (
            <TabStrip
              tabs={tabs}
              activeKey={activeKey}
              onActivate={(k) => {
                setActiveKey(k);
                const t = tabs.find((x) => x.key === k);
                setSaveState(t ? (t.conflict ? "conflict" : t.dirty ? "dirty" : "clean") : "clean");
              }}
              onClose={closeTab}
              onContext={tabMenu}
              onReorder={(from, to) => setTabs((p) => {
                const a = p.findIndex((t) => t.key === from);
                const b = p.findIndex((t) => t.key === to);
                if (a < 0 || b < 0) return p;
                const next = [...p];
                const [mv] = next.splice(a, 1);
                next.splice(b, 0, mv!);
                return next;
              })}
            />
          )}
          {wslError && (
            <div className="wsl-banner" role="alert">
              <span style={{ flex: 1 }}>Workspace unavailable — {wslError}</span>
              <button className="btn" onClick={() => void refreshTree(workspace)}>Reconnect</button>
            </div>
          )}
          {activeTab && recovery[activeTab.key] && (
            <div className="conflict-bar" role="alert" style={{ background: "var(--banner-recovery, #4a3800)", borderColor: "var(--border)" }}>
              <span style={{ flex: 1 }}>
                {recovery[activeTab.key]!.diskChanged
                  ? `${fileName(activeTab.relativePath)} changed since this unsaved draft was kept. Both versions are safe — choose one.`
                  : `Unsaved draft recovered from ${new Date(recovery[activeTab.key]!.updatedAt).toLocaleString()}. Not saved to file.`}
                {recovery[activeTab.key]!.stale ? " This draft is over 30 days old." : ""}
              </span>
              <button className="btn" onClick={() => restoreDraft(activeTab.key)}>Restore draft</button>
              <button className="btn" onClick={() => void discardDraft(activeTab.key)}>Discard draft</button>
            </div>
          )}
          {activeTab?.conflict && (
            <div className="conflict-bar" role="alert">
              <span style={{ flex: 1 }}>{fileName(activeTab.relativePath)} changed outside Desktop Notes. Your edits are still safe.</span>
              <button className="btn" onClick={() => void reloadFromDisk()}>Reload from disk</button>
              <button className="btn" onClick={() => void keepMyVersion()}>Keep my version</button>
            </div>
          )}
          {!activeTab ? (
            <div className="empty">
              <h2>No note open</h2>
              <p className="hint"><kbd className="k">{sc("file.quickOpen")}</kbd> Quick open · <kbd className="k">{sc("file.new")}</kbd> New note</p>
              {entries.length === 0 && !sidebarLoading && (
                <div className="actions"><button className="btn primary" onClick={newNote}>New note</button></div>
              )}
            </div>
          ) : activeTab.loadError ? (
            <div className="empty">
              <h2>Couldn&apos;t open {fileName(activeTab.relativePath)}</h2>
              <p>{activeTab.loadError} Your file is untouched.</p>
              <div className="actions"><button className="btn" onClick={() => closeTab(activeTab.key)}>Close tab</button></div>
            </div>
          ) : (
            <div className="editor-scroll">
              <div className={`editor-col${settings.fullWidth ? " full-width" : ""}`}>
                <div key={activeTab.key} ref={editorRef} aria-label={`Editing ${displayPath(activeTab.relativePath)}`} />
              </div>
            </div>
          )}
        </main>
      </div>
      {!focusMode && (
        <StatusBar workspace={workspace} words={words} line={cursor.line} col={cursor.col} saveState={saveLabel} />
      )}
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      {palette && (
        <CommandMenu
          mode={palette}
          files={allFiles}
          recents={recents}
          commands={commands}
          recentCommands={recentCommands}
          onOpenFile={(rel) => { runCommand("quick-open"); void openFile(rel); }}
          onClose={() => setPalette(null)}
        />
      )}
      {settingsOpen && (
        <SettingsDialog settings={settings} onChange={setSettings} version={version} platform={platform} onClose={() => setSettingsOpen(false)} />
      )}
      {wslDialog && <WslDialog dialog={wslDialog} onChange={setWslDialog} onConnect={connectWsl} onClose={() => setWslDialog(null)} />}
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />
    </div>
  );
}

function WslDialog({
  dialog,
  onChange,
  onConnect,
  onClose,
}: {
  dialog: { distros: WslDistribution[]; distro: string; path: string; error: string | null; connecting: boolean };
  onChange: (d: { distros: WslDistribution[]; distro: string; path: string; error: string | null; connecting: boolean }) => void;
  onConnect: () => void;
  onClose: () => void;
}): JSX.Element {
  return (
    <div className="dialog-wrap" onMouseDown={onClose}>
      <div className="dialog" role="dialog" aria-label="Open WSL folder" style={{ width: 440 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-head"><span style={{ flex: 1 }}>Open WSL folder</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="dialog-content" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {dialog.error && <p className="inline-error" role="alert">{dialog.error}</p>}
          {dialog.distros.length > 0 && (
            <>
              <label style={{ fontSize: 13 }}>Distribution
                <select
                  className="input" style={{ marginTop: 4 }}
                  value={dialog.distro} onChange={(e) => onChange({ ...dialog, distro: e.target.value })}
                >
                  {dialog.distros.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 13 }}>Folder in {dialog.distro || "WSL"}
                <input
                  className="input" style={{ marginTop: 4 }}
                  value={dialog.path} onChange={(e) => onChange({ ...dialog, path: e.target.value })}
                  placeholder="~/notes" aria-label="WSL folder path"
                />
              </label>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn" onClick={onClose}>Cancel</button>
                <button className="btn primary" disabled={!dialog.distro || dialog.connecting} onClick={onConnect}>
                  {dialog.connecting ? "Connecting…" : "Connect"}
                </button>
              </div>
            </>
          )}
          {dialog.distros.length === 0 && !dialog.error && <p style={{ fontSize: 13 }}>No distributions found.</p>}
        </div>
      </div>
    </div>
  );
}
