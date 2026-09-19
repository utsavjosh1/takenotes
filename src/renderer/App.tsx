import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import type { DirectoryEntry, SearchMatch, WorkspaceInfo, WslDistribution, WslLinuxUser } from "../shared/contracts/ipc";
import { usePlatform } from "./hooks/use-platform";
import { isWslKind, moveToTrashLabel, revealLabel, trashName } from "../shared/platform/filesystem";
import type { CommandId } from "../shared/platform/keymap";
import { TitleBar, ActivityRail, StatusBar } from "./components/chrome";
import { PaneView } from "./components/pane-view";
import { buildWorkspaceIndex, workspaceIndex } from "./index/workspace-index";
import { parseSearchQuery } from "../shared/search/query";
import { searchContent, searchFilenames } from "../shared/search/search";
import { FileTree, type TreeState } from "./components/tree";
import { SearchPanel, useDebouncedValue } from "./components/search";
import { ContextMenu, Toasts, TabStrip } from "./components/overlays";
import { CommandMenu, type CommandItem, type PaletteMode } from "./components/palette";
import { SettingsDialog } from "./components/settings";
import { Icon } from "./components/icons";
import stackedDarkUrl from "./assets/brand/takenotes-stacked-dark.svg";
import stackedLightUrl from "./assets/brand/takenotes-stacked-light.svg";
import { DEFAULT_SETTINGS, displayPath, fileName, joinRel, parentDir, type CtxMenu, type Settings, type Toast } from "./components/types";
import { friendlyError } from "./error-text";
import {
  activateDoc,
  activatePane,
  activeDoc,
  applyRename,
  closeDocInPane,
  closePane,
  createLayout,
  markConflict,
  markSaved,
  markSaving,
  openDocInPane,
  paneDocs,
  removeDocsForEntry,
  resolveDoc,
  splitPane,
  updateDocContent,
} from "./panes";

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
  // Pane layout (P1-06): shared open docs + explicit active pane. Dirty,
  // revision baselines, conflict, and save progress live per DOCUMENT —
  // saving one tab never alters another's state. Layout is window-local,
  // never persisted.
  const [layout, setLayout] = useState(() => createLayout());
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
  const [searchError, setSearchError] = useState<string | null>(null);
  const [allFiles, setAllFiles] = useState<DirectoryEntry[]>([]);
  const [recents, setRecents] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("takenotes.recents") ?? "[]"); } catch { return []; } });
  const [recentWorkspaces, setRecentWorkspaces] = useState<{ name: string; kind: string }[]>(() => { try { return JSON.parse(localStorage.getItem("takenotes.recentWs") ?? "[]"); } catch { return []; } });
  const [recentCommands, setRecentCommands] = useState<string[]>([]);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  // Crash-recovery drafts (userData store, main process). Keyed by tab key.
  // This is RECOVERY data only: `Saved` is shown exclusively for bytes that
  // reached the note file. A persisted draft never flips the save indicator.
  const [recovery, setRecovery] = useState<Record<string, { content: string; updatedAt: number; stale: boolean; diskChanged: boolean }>>({});
  const [wslDialog, setWslDialog] = useState<{
    distros: WslDistribution[]; distro: string;
    users: WslLinuxUser[]; linuxUser: string;
    usersLoading: boolean; usersError: string | null;
    path: string; error: string | null; connecting: boolean;
  } | null>(null);
  // In-app software update dialog (ADR-0006). Null = hidden. Auto-checks
  // stay silent unless an update is actually available.
  type UpdatePhase = "checking" | "available" | "uptodate" | "downloading" | "verifying" | "launching" | "error";
  const [updateDlg, setUpdateDlg] = useState<{
    phase: UpdatePhase; latest: string | null; notes: string | null; error: string | null;
    received: number; total: number | null;
  } | null>(null);
  const [wslError, setWslError] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ dir: string; folder: boolean } | null>(null);
  const [createName, setCreateName] = useState("");
  const [version, setVersion] = useState("0.0.1");
  const [sidebarLoading, setSidebarLoading] = useState(false);
  const platform = usePlatform();
  const sc = (id: CommandId): string => platform.shortcutLabel(id);

  const activeTab = activeDoc(layout);
  // Status save segment derives from the ACTIVE document (P1-06): a
  // conflict elsewhere never poisons this indicator.
  const docSaveView = !activeTab
    ? ("clean" as const)
    : activeTab.conflict
      ? ("conflict" as const)
      : activeTab.saving
        ? ("saving" as const)
        : activeTab.dirty
          ? ("dirty" as const)
          : activeTab.savedAt
            ? ("saved" as const)
            : ("clean" as const);
  const dragResize = useRef<{ startX: number; startW: number } | null>(null);

  /* ---------- helpers ---------- */
  const toast = useCallback((text: string, kind: Toast["kind"] = "info") => {
    const id = toastId++;
    setToasts((p) => [...p.slice(-3), { id, kind, text }]);
    if (kind === "info") setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 5000);
  }, []);

  /** Distinct error toasts (P1-04): the headline names the failure kind so
   * PERMISSION_DENIED never reads as NOT_FOUND. Takes the structured
   * `{ code, message }` every IPC result carries. */
  const errToast = useCallback((error: { code: string; message: string }, prefix?: string) => {
    const text = friendlyError(error.code, error.message);
    toast(prefix ? `${prefix} — ${text}` : text, "error");
  }, [toast]);

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
    // Silent startup update check (ADR-0006): main enforces the 24h cadence
    // and offline silence; an available update opens the dialog.
    void window.takenotes.update.check(false).then((r) => {
      if (r.ok && r.result.updateAvailable && r.result.latestVersion) {
        setUpdateDlg({ phase: "available", latest: r.result.latestVersion, notes: r.result.releaseNotes, error: null, received: 0, total: null });
      }
    }).catch(() => undefined);
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
      else errToast(res.error);
    }
  }, [toast, errToast]);

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

  // Parse-once index refresh (P1-07): runs async after open so the editor
  // stays snappy; workspace-level failures surface like tree failures.
  const refreshWorkspaceIndex = useCallback(async (ws: WorkspaceInfo) => {
    const res = await buildWorkspaceIndex(window.takenotes, workspaceIndex, ws);
    if (!res.ok) {
      if (isWslKind(ws.type)) setWslError(res.error.message);
      else errToast(res.error, "Couldn't build the search index");
    }
  }, [errToast]);

  const openWorkspace = useCallback(async (ws: WorkspaceInfo) => {
    setWorkspace(ws);
    setLayout(createLayout()); setCursor({ line: 1, col: 1 });
    setRecentWorkspaces((p) => {
      const next = [{ name: ws.displayName, kind: ws.type }, ...p.filter((r) => r.name !== ws.displayName)].slice(0, 8);
      localStorage.setItem("takenotes.recentWs", JSON.stringify(next));
      return next;
    });
    await refreshTree(ws);
    await rebuildAllFiles(ws);
    // Index builds in the background: open stays fast on big workspaces.
    void refreshWorkspaceIndex(ws);
  }, [refreshTree, rebuildAllFiles, refreshWorkspaceIndex]);

  const openLocal = useCallback(async () => {
    const res = await window.takenotes.workspace.openLocal();
    if (!res.ok) { toast(res.error.message, "error"); return; }
    if (res.result) void openWorkspace(res.result);
  }, [openWorkspace, toast]);

  const fetchWslUsers = useCallback(async (distro: string, base: NonNullable<typeof wslDialog>) => {
    setWslDialog({ ...base, distro, users: [], linuxUser: "", usersLoading: true, usersError: null });
    const res = await window.takenotes.workspace.listWslUsers(distro);
    // The dialog may have closed or switched distros while loading: only
    // apply results that still belong to the requested distro.
    setWslDialog((cur) => {
      if (!cur || cur.distro !== distro) return cur;
      if (!res.ok) return { ...cur, users: [], linuxUser: "", usersLoading: false, usersError: res.error.message };
      const def = res.result.find((u) => u.isDefault) ?? res.result[0];
      return { ...cur, users: res.result, linuxUser: def?.username ?? "", usersLoading: false, usersError: null };
    });
  }, []);

  const openWslDialog = useCallback(async () => {
    const res = await window.takenotes.workspace.listWslDistributions();
    if (!res.ok) {
      setWslDialog({ distros: [], distro: "", users: [], linuxUser: "", usersLoading: false, usersError: null, path: "~/notes", error: res.error.message, connecting: false });
      return;
    }
    const distro = res.result[0]?.name ?? "";
    const base = { distros: res.result, distro, users: [] as WslLinuxUser[], linuxUser: "", usersLoading: true, usersError: null as string | null, path: "~/notes", error: null as string | null, connecting: false };
    setWslDialog(base);
    if (distro) void fetchWslUsers(distro, base);
  }, [fetchWslUsers]);

  const connectWsl = useCallback(async () => {
    if (!wslDialog || !wslDialog.distro || !wslDialog.linuxUser) return;
    setWslDialog({ ...wslDialog, connecting: true, error: null });
    const res = await window.takenotes.workspace.connectWsl(wslDialog.distro, wslDialog.linuxUser, wslDialog.path || "~/notes");
    setWslDialog({ ...wslDialog, connecting: false, error: res.ok ? null : res.error.message });
    if (res.ok) {
      setWslDialog(null);
      toast(`Connecting to ${wslDialog.distro} as ${wslDialog.linuxUser}…`);
      await openWorkspace(res.result);
    }
  }, [wslDialog, openWorkspace, toast]);

  /* ---------- software updates (ADR-0006, Windows-only) ---------- */
  const checkForUpdates = useCallback(async (manual: boolean) => {
    if (!platform.capabilities.updates) {
      if (manual) toast("Software updates are available on Windows in this version.", "error");
      return;
    }
    if (manual) setSettingsOpen(false);
    setUpdateDlg({ phase: "checking", latest: null, notes: null, error: null, received: 0, total: null });
    const res = await window.takenotes.update.check(manual);
    if (!res.ok) {
      // Silent startup path + offline = stay silent (main already hides it
      // too; this is the belt-and-suspenders for any OFFLINE leak-through).
      if (!manual && res.error.code === "OFFLINE") { setUpdateDlg(null); return; }
      setUpdateDlg({ phase: "error", latest: null, notes: null, error: res.error.message, received: 0, total: null });
      return;
    }
    const r = res.result;
    if (r.updateAvailable && r.latestVersion) {
      setUpdateDlg({ phase: "available", latest: r.latestVersion, notes: r.releaseNotes, error: null, received: 0, total: null });
    } else if (manual) {
      setUpdateDlg({ phase: "uptodate", latest: null, notes: null, error: null, received: 0, total: null });
    } else {
      setUpdateDlg(null);
    }
  }, [platform.capabilities.updates, toast]);

  const downloadUpdate = useCallback(async () => {
    setUpdateDlg((d) => (d ? { ...d, phase: "downloading", received: 0, total: null } : d));
    const off = window.takenotes.events.onUpdateProgress((p) => {
      setUpdateDlg((d) => (d ? { ...d, phase: p.phase, received: p.receivedBytes, total: p.totalBytes } : d));
    });
    try {
      const res = await window.takenotes.update.download();
      // ok → main launches the installer and quits; nothing left to render.
      if (!res.ok) setUpdateDlg((d) => (d ? { ...d, phase: "error", error: res.error.message } : d));
    } finally {
      off();
    }
  }, []);

  // Every opener names its pane explicitly (default: the active pane) so
  // tree/search/palette actions always land in a known place.
  const openFile = useCallback(async (relativePath: string, paneId?: string) => {
    if (!workspace) return;
    const targetPane = paneId ?? layout.activePaneId;
    const key = `${workspace.workspaceId}:${relativePath}`;
    if (layout.docs[key]) {
      // Already open: reveal it. State (dirty/conflict/baseline) is kept —
      // reopening never resets revision baselines.
      setLayout((l) => activateDoc(l, targetPane, key));
      setCursor({ line: 1, col: 1 });
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
        setLayout((l) => openDocInPane(l, targetPane, { key, relativePath, content: draft.content, dirty: true, revisionHash: "", newlineStyle: "lf", hadBom: false, conflict: false, loadError: null, saving: false, savedAt: "" }));
        setCursor({ line: 1, col: 1 });
        setRecovery((p) => ({ ...p, [key]: { content: draft.content, updatedAt: draft.updatedAt, stale: draft.stale, diskChanged: true } }));
        toast("The original file is gone. Your unsaved draft was retained — save it to keep it.", "error");
        return;
      }
      if (res.error.code === "TOO_LARGE" || res.error.code === "UNSUPPORTED_ENCODING") {
        setLayout((l) => openDocInPane(l, targetPane, { key, relativePath, content: "", dirty: false, revisionHash: "", newlineStyle: "lf", hadBom: false, conflict: false, loadError: res.error.message, saving: false, savedAt: "" }));
      } else errToast(res.error, `Couldn't open ${fileName(relativePath)}`);
      return;
    }
    const file = res.result;
    setLayout((l) => openDocInPane(l, targetPane, { key, relativePath, content: file.content, dirty: false, revisionHash: file.revision.hash, newlineStyle: file.newlineStyle, hadBom: file.hadBom, conflict: false, loadError: null, saving: false, savedAt: "" }));
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
  }, [workspace, layout, toast, errToast]);

  // Edits name their document: with two panes on one file, both render the
  // same shared doc, so either pane's keystrokes dirty both views at once.
  const onEdit = useCallback((docKey: string, content: string) => {
    setLayout((l) => updateDocContent(l, docKey, content));
  }, []);

  // Save names its document explicitly (default: the active pane's active
  // doc). Only the target doc's dirty/conflict/baseline change — neighbors
  // are untouched. No save/conflict semantics change (P1-05 owns those).
  const save = useCallback(async (docKey?: string) => {
    if (!workspace) return;
    const target = docKey ? layout.docs[docKey] : activeDoc(layout);
    if (!target || target.loadError) return;
    const key = target.key;
    setLayout((l) => markSaving(l, key, true));
    const res = await window.takenotes.file.write({
      workspaceId: workspace.workspaceId,
      relativePath: target.relativePath,
      content: target.content,
      expectedHash: target.revisionHash,
      newlineStyle: target.newlineStyle,
      hadBom: target.hadBom,
    });
    if (!res.ok) {
      if (res.error.code === "CONFLICT") {
        setLayout((l) => markConflict(l, key));
      } else {
        setLayout((l) => markSaving(l, key, false));
        errToast(res.error, `Couldn't save ${fileName(target.relativePath)}. Your edits are still safe`);
      }
      return;
    }
    setLayout((l) => markSaved(l, key, res.result.hash, new Date().toLocaleTimeString()));
    // File changed → replace exactly this index entry (content + the
    // authoritative post-write revision: zero extra reads).
    workspaceIndex.upsert(workspace.workspaceId, target.relativePath, target.content, res.result);
    // The file now holds the truth: the recovery draft is obsolete.
    setRecovery((p) => {
      if (!(key in p)) return p;
      const next = { ...p };
      delete next[key];
      return next;
    });
    safeDraftClear(workspace.workspaceId, target.relativePath);
    void rebuildAllFiles(workspace);
  }, [workspace, layout, toast, errToast, rebuildAllFiles]);

  const reloadFromDisk = useCallback(async (docKey?: string) => {
    if (!workspace) return;
    const target = docKey ? layout.docs[docKey] : activeDoc(layout);
    if (!target) return;
    console.error("[file-read] reload request", {
      workspaceId: workspace.workspaceId,
      workspaceType: workspace.type,
      relativePath: target.relativePath,
    });
    const res = await window.takenotes.file.read(workspace.workspaceId, target.relativePath);
    if (!res.ok) {
      console.error("[file-read] reload failed", {
        workspaceId: workspace.workspaceId,
        workspaceType: workspace.type,
        relativePath: target.relativePath,
        code: res.error.code,
        message: res.error.message,
      });
      errToast(res.error, "Couldn't reload from disk"); return; }
    setLayout((l) => resolveDoc(l, target.key, res.result.content, res.result.revision.hash));
  }, [workspace, layout, toast, errToast]);

  const keepMyVersion = useCallback(async (docKey?: string) => {
    if (!workspace) return;
    const target = docKey ? layout.docs[docKey] : activeDoc(layout);
    if (!target) return;
    const res = await window.takenotes.file.read(workspace.workspaceId, target.relativePath);
    if (!res.ok) { errToast(res.error); return; }
    const diskHash = res.result.revision.hash;
    const res2 = await window.takenotes.file.write({
      workspaceId: workspace.workspaceId, relativePath: target.relativePath, content: target.content,
      expectedHash: diskHash, newlineStyle: target.newlineStyle, hadBom: target.hadBom,
    });
    if (!res2.ok) { errToast(res2.error); return; }
    setLayout((l) => markSaved(l, target.key, res2.result.hash, new Date().toLocaleTimeString()));
    // Conflict resolved by overwrite: the file changed → re-parse it.
    workspaceIndex.upsert(workspace.workspaceId, target.relativePath, target.content, res2.result);
  }, [workspace, layout, toast, errToast]);

  const closeTab = useCallback((paneId: string, key: string) => {
    // Dirty tabs are never silently discarded: flush the dirty buffer into
    // the EXISTING draft store first (P1-10 owns recovery; this only feeds
    // it — no second unsaved-content system). Closing still does NOT delete
    // drafts: a quit-with-dirty followed by restart must offer recovery.
    const doc = layout.docs[key];
    if (workspace && doc && doc.dirty && !doc.loadError && doc.revisionHash) {
      safeDraftPut({
        workspaceId: workspace.workspaceId,
        relativePath: doc.relativePath,
        baseRevisionHash: doc.revisionHash,
        content: doc.content,
      });
    }
    setLayout((l) => closeDocInPane(l, paneId, key).layout);
    setCursor({ line: 1, col: 1 });
  }, [workspace, layout]);

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
    setLayout((l) => updateDocContent(l, key, rec.content));
  }, [recovery]);

  const discardDraft = useCallback((key: string) => {
    if (!workspace) return;
    const doc = layout.docs[key];
    if (doc) safeDraftClear(workspace.workspaceId, doc.relativePath);
    setRecovery((p) => {
      const next = { ...p };
      delete next[key];
      return next;
    });
  }, [workspace, layout]);

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
        errToast(res.error);
      }
      return;
    }
    setTree((p) => ({ ...p, expanded }));
  }, [workspace, tree, toast, errToast]);

  const commitCreate = useCallback(async () => {
    if (!workspace || !creating || !createName.trim()) return;
    const name = createName.trim();
    // Folders go through directory.create; notes through file.create (parents
    // created implicitly). Both refresh the tree when complete.
    if (creating.folder) {
      const rel = joinRel(creating.dir, name);
      const res = await window.takenotes.directory.create(workspace.workspaceId, rel);
      if (!res.ok) { errToast(res.error, `Couldn't create folder "${name}"`); return; }
      setCreating(null); setCreateName("");
      if (creating.dir) {
        const res2 = await window.takenotes.directory.list(workspace.workspaceId, creating.dir);
        if (res2.ok) setTree((p) => ({ ...p, children: new Map(p.children).set(creating.dir, res2.result) }));
      } else await refreshTree(workspace);
      await rebuildAllFiles(workspace);
      return;
    }
    const rel = joinRel(creating.dir, name);
    const target = (/\.md$/i.test(rel) ? rel : `${rel}.md`);
    const res = await window.takenotes.file.create(workspace.workspaceId, target);
    if (!res.ok) { errToast(res.error, `Couldn't create "${target}"`); return; }
    // Created files are empty: index the blank entry with its revision.
    workspaceIndex.upsert(workspace.workspaceId, target, "", res.result);
    setCreating(null); setCreateName("");
    if (creating.dir) {
      const res2 = await window.takenotes.directory.list(workspace.workspaceId, creating.dir);
      if (res2.ok) setTree((p) => ({ ...p, children: new Map(p.children).set(creating.dir, res2.result) }));
    } else await refreshTree(workspace);
    await rebuildAllFiles(workspace);
    await openFile(target);
  }, [workspace, creating, createName, toast, errToast, refreshTree, rebuildAllFiles, openFile]);

  const commitRename = useCallback(async (entry: DirectoryEntry, newName: string) => {
    if (!workspace) return;
    const dir = parentDir(entry.relativePath);
    const newRel = joinRel(dir, newName);
    // Folders rename through directory.rename; files through file.rename.
    const res = entry.kind === "directory"
      ? await window.takenotes.directory.rename(workspace.workspaceId, entry.relativePath, newRel)
      : await window.takenotes.file.rename(workspace.workspaceId, entry.relativePath, newRel);
    setTree((p) => ({ ...p, renaming: null }));
    if (!res.ok) { errToast(res.error, "Couldn't rename"); return; }
    // Rename remaps open keys in place: baselines survive the rename.
    setLayout((l) => applyRename(l, workspace.workspaceId, entry.relativePath, newRel));
    // Rename moves the index entry without re-parsing (bytes unchanged).
    if (entry.kind === "directory") workspaceIndex.movePrefix(workspace.workspaceId, entry.relativePath, newRel);
    else workspaceIndex.move(workspace.workspaceId, entry.relativePath, newRel);
    if (dir) {
      const res2 = await window.takenotes.directory.list(workspace.workspaceId, dir);
      if (res2.ok) setTree((p) => ({ ...p, children: new Map(p.children).set(dir, res2.result) }));
    } else await refreshTree(workspace);
    await rebuildAllFiles(workspace);
  }, [workspace, toast, errToast, refreshTree, rebuildAllFiles]);

  const deleteDirectory = useCallback(async (entry: DirectoryEntry) => {
    if (!workspace) return;
    // WSL folders delete permanently in P1 (helper `directory.delete`):
    // label it honestly, never as Recycle Bin trash.
    const wslDel = isWslKind(workspace.type);
    if (settings.confirmTrash && !window.confirm(wslDel ? `Permanently delete folder "${entry.name}"? This cannot be undone.` : `Delete folder "${entry.name}"?`)) return;
    const res = await window.takenotes.directory.delete(workspace.workspaceId, entry.relativePath);
    if (!res.ok) {
      // Non-empty folders need an explicit recursive confirm (no silent wipe).
      if (res.error.code === "DIRECTORY_NOT_EMPTY") {
        if (!window.confirm(`"${entry.name}" is not empty. Delete it and everything inside?`)) return;
        const res2 = await window.takenotes.directory.delete(workspace.workspaceId, entry.relativePath, true);
        if (!res2.ok) { errToast(res2.error, `Couldn't delete folder "${entry.name}"`); return; }
      } else {
        errToast(res.error, `Couldn't delete folder "${entry.name}"`);
        return;
      }
    }
    setLayout((l) => removeDocsForEntry(l, workspace.workspaceId, entry.relativePath));
    // Folder delete drops the whole index prefix (exact + everything under).
    workspaceIndex.removePrefix(workspace.workspaceId, entry.relativePath);
    const dir = parentDir(entry.relativePath);
    if (dir) {
      const res2 = await window.takenotes.directory.list(workspace.workspaceId, dir);
      if (res2.ok) setTree((p) => ({ ...p, children: new Map(p.children).set(dir, res2.result) }));
    } else await refreshTree(workspace);
    await rebuildAllFiles(workspace);
    toast(`Deleted folder "${entry.name}".`);
  }, [workspace, settings.confirmTrash, toast, errToast, refreshTree, rebuildAllFiles]);

  const trashEntry = useCallback(async (entry: DirectoryEntry) => {
    if (!workspace) return;
    // WSL delete is permanent-delete in P1 (helper `file.delete`): label it
    // honestly — never "Move to trash" / Recycle Bin for WSL workspaces.
    const wsl = isWslKind(workspace.type);
    if (settings.confirmTrash && !window.confirm(wsl ? `Permanently delete "${entry.name}"? This cannot be undone.` : `Move "${entry.name}" to trash?`)) return;
    const res = await window.takenotes.file.trash(workspace.workspaceId, entry.relativePath);
    if (!res.ok) { errToast(res.error, wsl ? `Couldn't delete "${entry.name}"` : undefined); return; }
    setLayout((l) => removeDocsForEntry(l, workspace.workspaceId, entry.relativePath));
    workspaceIndex.removePrefix(workspace.workspaceId, entry.relativePath);
    const dir = parentDir(entry.relativePath);
    if (dir) {
      const res2 = await window.takenotes.directory.list(workspace.workspaceId, dir);
      if (res2.ok) setTree((p) => ({ ...p, children: new Map(p.children).set(dir, res2.result) }));
    } else await refreshTree(workspace);
    await rebuildAllFiles(workspace);
    if (isWslKind(workspace.type)) toast(`Permanently deleted "${entry.name}". This cannot be undone — WSL workspaces don't use the ${trashName(platform.platform)}.`);
    else toast(`Moved "${entry.name}" to trash. Recoverable from ${trashName(platform.platform)} — ${moveToTrashLabel(platform.platform)}.`);
  }, [workspace, settings.confirmTrash, toast, errToast, refreshTree, rebuildAllFiles, platform.platform]);

  const removeEntry = useCallback(async (entry: DirectoryEntry) => {
    // Folders delete through directory.delete; files move to OS trash.
    if (entry.kind === "directory") return deleteDirectory(entry);
    return trashEntry(entry);
  }, [deleteDirectory, trashEntry]);

  /* ---------- search (P1-08: in-memory index, zero filesystem reads) ---------- */
  const debouncedQuery = useDebouncedValue(searchQuery, 250);
  useEffect(() => {
    if (!workspace || !debouncedQuery.trim()) {
      setFilenameHits([]); setContentHits([]); setSearchError(null); setSearching(false);
      return;
    }
    // Queries read the live P1-07 index only — never IPC, never the
    // filesystem. `layout` in deps re-runs the query after saves, renames,
    // and deletes, so results follow mutations with no rescan.
    const parsed = parseSearchQuery(debouncedQuery.trim());
    if (!parsed.ok) {
      setFilenameHits([]); setContentHits([]);
      setSearchError(parsed.error.message);
      setSearching(false);
      return;
    }
    setSearchError(null);
    setSearching(false);
    setFilenameHits(searchFilenames(workspaceIndex, workspace.workspaceId, parsed.query).slice(0, 20));
    setContentHits(searchContent(workspaceIndex, workspace.workspaceId, parsed.query).slice(0, 60));
  }, [debouncedQuery, workspace, layout]);

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

  // Split helpers (declared before the command table that references
  // them): two-pane model, window-local, never persisted.
  const splitActive = useCallback((orientation: "horizontal" | "vertical") => {
    setLayout((l) => splitPane(l, l.activePaneId, orientation));
    setCursor({ line: 1, col: 1 });
  }, []);

  const closeActivePane = useCallback(() => {
    setLayout((l) => closePane(l, l.activePaneId));
    setCursor({ line: 1, col: 1 });
  }, []);

  const focusOtherPane = useCallback(() => {
    setLayout((l) => {
      const i = l.panes.findIndex((p) => p.id === l.activePaneId);
      const next = l.panes[(i + 1) % l.panes.length]!;
      return activatePane(l, next.id);
    });
    setCursor({ line: 1, col: 1 });
  }, []);

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
      { id: "file.closeTab", title: "Close current tab", shortcut: sc("file.closeTab"), run: () => { const a = activeDoc(layout); if (a) closeTab(layout.activePaneId, a.key); } },
      { id: "view.splitRight", title: "Split editor right", run: () => splitActive("vertical") },
      { id: "view.splitDown", title: "Split editor down", run: () => splitActive("horizontal") },
      { id: "view.closeSplit", title: "Close split pane", run: () => closeActivePane() },
      { id: "view.focusOtherPane", title: "Focus other pane", run: () => focusOtherPane() },
      { id: "workspace.refresh", title: "Refresh file tree", run: () => { if (workspace) { void refreshTree(workspace); void rebuildAllFiles(workspace); void refreshWorkspaceIndex(workspace); } } },
      { id: "settings.open", title: "Open settings", shortcut: sc("settings.open"), run: () => setSettingsOpen(true) },
    ];
    if (platform.capabilities.updates) {
      items.push({ id: "app.checkForUpdates", title: "Check for updates…", run: () => void checkForUpdates(true) });
    }
    if (platform.capabilities.wsl) {
      items.splice(4, 0, { id: "workspace.openWsl", title: "Open WSL folder…", run: () => void openWslDialog() });
    }
    return items;
  }, [newNote, save, openLocal, openWslDialog, checkForUpdates, layout, closeTab, splitActive, closeActivePane, focusOtherPane, workspace, refreshTree, rebuildAllFiles, refreshWorkspaceIndex, sc, platform.capabilities.wsl, platform.capabilities.updates]);

  /* Native menu → same command dispatch (§59). Menu accelerators and the
   * palette forward CommandIds here; mouse and keyboard share one path. */
  useEffect(() => {
    const off = window.takenotes.events.onCommand((id: CommandId) => {
      switch (id) {
        case "file.new": newNote(); break;
        case "file.save": void save(); break;
        case "file.quickOpen": setPalette({ kind: "quick" }); break;
        case "file.closeTab": { const a = activeDoc(layout); if (a) closeTab(layout.activePaneId, a.key); break; }
        case "commandPalette.open": setPalette({ kind: "commands" }); break;
        case "workspace.search": setView("search"); setSidebarOpen(true); break;
        case "editor.find": break; // CodeMirror search keymap owns editor find (§58)
        case "settings.open": setSettingsOpen(true); break;
        case "app.checkForUpdates": void checkForUpdates(true); break;
        case "view.toggleSidebar": setSidebarOpen((v) => !v); break;
        case "view.toggleFocus": setFocusMode((v) => !v); break;
        case "file.closeWindow": window.close(); break;
        default: break;
      }
    });
    return off;
  }, [newNote, save, layout, closeTab, checkForUpdates]);

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
      if (mod && e.key.toLowerCase() === "w") { e.preventDefault(); const a = activeDoc(layout); if (a) closeTab(layout.activePaneId, a.key); return; }
      // Pane focus without stealing editor focus: Alt+1 / Alt+2 selects the
      // pane; the editor keeps whatever focus it had (no jump on switch).
      if (e.altKey && !mod && (e.key === "1" || e.key === "2")) {
        const target = layout.panes[Number(e.key) - 1];
        if (target && target.id !== layout.activePaneId) {
          e.preventDefault();
          setLayout((l) => activatePane(l, target.id));
          setCursor({ line: 1, col: 1 });
        }
        return;
      }
      if (mod && e.key === "\\") { e.preventDefault(); setSidebarOpen((v) => !v); return; }
      if (mod && e.key.toLowerCase() === ",") { e.preventDefault(); setSettingsOpen(true); return; }
      if (mod && e.key === ".") { e.preventDefault(); setFocusMode((v) => !v); return; }
      if (mod && e.key === "Tab") {
        // Tab cycling stays inside the active pane.
        e.preventDefault();
        const keys = paneDocs(layout, layout.activePaneId).map((d) => d.key);
        const cur = activeDoc(layout)?.key;
        if (keys.length >= 2 && cur) {
          const i = keys.indexOf(cur);
          const n = keys[(i + (e.shiftKey ? keys.length - 1 : 1)) % keys.length]!;
          setLayout((l) => activateDoc(l, layout.activePaneId, n));
          setCursor({ line: 1, col: 1 });
        }
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
        if (found) { e.preventDefault(); void removeEntry(found); }
        return;
      }
      if (isMacTree && e.metaKey && e.key === "Backspace" && tree.selected && !inField(e.target)) {
        const sel = tree.selected;
        const found = entries.concat(...tree.children.values()).find((x) => x.relativePath === sel);
        if (found) { e.preventDefault(); void removeEntry(found); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, newNote, layout, closeTab, tree.selected, tree.children, entries, removeEntry, palette, platform.platform]);

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
        { label: "Delete folder", danger: true, run: () => void removeEntry(entry) },
      ] : [
        { label: "Open", run: () => void openFile(entry.relativePath), disabled: !openable },
        { label: "Rename", shortcut: sc("tree.rename"), run: () => setTree((p) => ({ ...p, renaming: entry.relativePath })) },
        { label: "Copy relative path", run: () => void navigator.clipboard.writeText(displayPath(entry.relativePath)) },
        { label: revealLabel(platform.platform), run: () => void window.takenotes.shell.reveal(workspace!.workspaceId, entry.relativePath) },
        { label: "---", run: () => undefined },
        { label: workspace && isWslKind(workspace.type) ? "Delete permanently…" : moveToTrashLabel(platform.platform), shortcut: sc("tree.trash"), danger: true, run: () => void trashEntry(entry) },
      ],
    });
  };

  // Tab context actions stay inside their own pane; sibling panes are
  // untouched (each close still flushes dirty buffers to drafts first).
  const tabMenu = (paneId: string, key: string, e: React.MouseEvent): void => {
    e.preventDefault();
    setMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: "Close", shortcut: sc("file.closeTab"), run: () => closeTab(paneId, key) },
        {
          label: "Close others",
          run: () => {
            for (const k of paneDocs(layout, paneId).map((d) => d.key).filter((k) => k !== key)) closeTab(paneId, k);
          },
        },
        {
          label: "Close to the right",
          run: () => {
            const keys = paneDocs(layout, paneId).map((d) => d.key);
            for (const k of keys.slice(keys.indexOf(key) + 1)) closeTab(paneId, k);
          },
        },
      ],
    });
  };

  /* ---------- editor ---------- */
  // Cursor reports come from the active pane's editor only (PaneView gates
  // with reportCursor); switching panes never steals keyboard focus.
  const onCursor = useCallback((line: number, col: number) => {
    setCursor((p) => (p.line === line && p.col === col ? p : { line, col }));
  }, []);

  const words = useMemo(() => {
    const c = activeTab?.content.trim() ?? "";
    return c ? c.split(/\s+/).length : 0;
  }, [activeTab?.content]);

  /* ---------- render ---------- */
  if (!workspace) {
    return (
      <div className="app">
        <TitleBar workspace={null} platform={platform} onQuickOpen={() => {}} onOpenWindows={() => void openLocal()} onOpenWsl={() => void openWslDialog()} />
        <div className="empty">
          <img src={stackedDarkUrl} className="brand-logo only-dark" alt="takenotes" draggable={false} />
          <img src={stackedLightUrl} className="brand-logo only-light" alt="takenotes" draggable={false} />
          <p>Open your notes</p>
          <div className="actions">
            <button className="btn primary" onClick={() => void openLocal()}>Open folder</button>
            {platform.capabilities.wsl && (
              <button className="btn" onClick={() => void openWslDialog()}>Open WSL folder</button>
            )}
          </div>
          <p className="hint">Your notes stay where they are. takenotes works directly with Markdown files.</p>
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
        {wslDialog && <WslDialog dialog={wslDialog} onChange={setWslDialog} onDistro={(d) => void fetchWslUsers(d, wslDialog)} onConnect={connectWsl} onClose={() => setWslDialog(null)} />}
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
                  {isWslKind(workspace.type) && <span className="sub">WSL{workspace.linuxUser ? ` · ${workspace.linuxUser}` : ""}</span>}
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
                    searchError={searchError}
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
          {wslError && (
            <div className="wsl-banner" role="alert">
              <span style={{ flex: 1 }}>Workspace unavailable — {wslError}</span>
              <button className="btn" onClick={() => { void refreshTree(workspace); void refreshWorkspaceIndex(workspace); }}>Reconnect</button>
            </div>
          )}
          {/* Split panes (P1-06): at most two, side-by-side or stacked.
              Each pane owns its tab order and active tab; documents are
              shared, so two panes on one file always agree. Banners bind to
              the pane's own doc — a conflict elsewhere never leaks in. */}
          <div className={`split-wrap ${layout.orientation}`} role="group" aria-label="Editor panes">
            {layout.panes.map((p, pi) => {
              const docs = paneDocs(layout, p.id);
              const doc = p.activeKey ? layout.docs[p.activeKey] ?? null : null;
              const isActive = p.id === layout.activePaneId;
              const rec = doc ? recovery[doc.key] : undefined;
              return (
                <section
                  key={p.id}
                  className={`pane${isActive ? " active" : ""}`}
                  aria-label={`Editor pane ${pi + 1}${isActive ? ", active" : ""}`}
                  onMouseDown={() => { if (!isActive) setLayout((l) => activatePane(l, p.id)); }}
                >
                  {!focusMode && (
                    <div className="pane-bar">
                      {layout.panes.length > 1 && <span className="pane-title">Pane {pi + 1}</span>}
                      <span className="pane-actions">
                        <button className="link" title="Split editor right" aria-label={`Split pane ${pi + 1} right`} onClick={() => splitActive("vertical")}>Split right</button>
                        <button className="link" title="Split editor below" aria-label={`Split pane ${pi + 1} down`} onClick={() => splitActive("horizontal")}>Split down</button>
                        {layout.panes.length > 1 && (
                          <button className="link" title="Close this split pane" aria-label={`Close pane ${pi + 1}`} onClick={() => closeActivePane()}>Close pane</button>
                        )}
                      </span>
                    </div>
                  )}
                  {!focusMode && (
                    <TabStrip
                      tabs={docs}
                      activeKey={p.activeKey}
                      onActivate={(k) => { setLayout((l) => activateDoc(l, p.id, k)); setCursor({ line: 1, col: 1 }); }}
                      onClose={(k) => closeTab(p.id, k)}
                      onContext={(e, k) => tabMenu(p.id, k, e)}
                      onReorder={(from, to) => setLayout((l) => {
                        const pp = l.panes.find((x) => x.id === p.id)!;
                        const a = pp.openKeys.indexOf(from);
                        const b = pp.openKeys.indexOf(to);
                        if (a < 0 || b < 0) return l;
                        const openKeys = [...pp.openKeys];
                        const [mv] = openKeys.splice(a, 1);
                        openKeys.splice(b, 0, mv!);
                        return { ...l, panes: l.panes.map((x) => (x.id === p.id ? { ...x, openKeys } : x)) };
                      })}
                    />
                  )}
                  {doc && rec && (
                    <div className="conflict-bar" role="alert" style={{ background: "var(--banner-recovery, #4a3800)", borderColor: "var(--border)" }}>
                      <span style={{ flex: 1 }}>
                        {rec.diskChanged
                          ? `${fileName(doc.relativePath)} changed since this unsaved draft was kept. Both versions are safe — choose one.`
                          : `Unsaved draft recovered from ${new Date(rec.updatedAt).toLocaleString()}. Not saved to file.`}
                        {rec.stale ? " This draft is over 30 days old." : ""}
                      </span>
                      <button className="btn" onClick={() => restoreDraft(doc.key)}>Restore draft</button>
                      <button className="btn" onClick={() => void discardDraft(doc.key)}>Discard draft</button>
                    </div>
                  )}
                  {doc?.conflict && (
                    <div className="conflict-bar" role="alert">
                      <span style={{ flex: 1 }}>{fileName(doc.relativePath)} changed outside Desktop Notes. Your edits are still safe.</span>
                      <button className="btn" onClick={() => void reloadFromDisk(doc.key)}>Reload from disk</button>
                      <button className="btn" onClick={() => void keepMyVersion(doc.key)}>Keep my version</button>
                    </div>
                  )}
                  {!doc ? (
                    <div className="empty">
                      <h2>No note open</h2>
                      <p className="hint"><kbd className="k">{sc("file.quickOpen")}</kbd> Quick open · <kbd className="k">{sc("file.new")}</kbd> New note</p>
                      {entries.length === 0 && !sidebarLoading && (
                        <div className="actions"><button className="btn primary" onClick={newNote}>New note</button></div>
                      )}
                    </div>
                  ) : doc.loadError ? (
                    <div className="empty">
                      <h2>Couldn&apos;t open {fileName(doc.relativePath)}</h2>
                      <p>{doc.loadError} Your file is untouched.</p>
                      <div className="actions"><button className="btn" onClick={() => closeTab(p.id, doc.key)}>Close tab</button></div>
                    </div>
                  ) : (
                    <PaneView
                      docKey={doc.key}
                      content={doc.content}
                      relativePath={doc.relativePath}
                      lineNumbers={settings.lineNumbers}
                      wordWrap={settings.wordWrap}
                      fullWidth={settings.fullWidth}
                      reportCursor={isActive}
                      onEdit={onEdit}
                      onCursor={onCursor}
                    />
                  )}
                </section>
              );
            })}
          </div>
        </main>
      </div>
      {!focusMode && (
        <StatusBar
          workspace={workspace}
          words={words}
          line={cursor.line}
          col={cursor.col}
          doc={docSaveView}
          savedAt={activeTab?.savedAt ?? ""}
          connection={wslError ? "disconnected" : workspace.connection}
          fileCount={allFiles.length}
        />
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
        <SettingsDialog settings={settings} onChange={setSettings} version={version} platform={platform} updatesEnabled={platform.capabilities.updates} onCheckUpdates={() => void checkForUpdates(true)} onClose={() => setSettingsOpen(false)} />
      )}
      {wslDialog && <WslDialog dialog={wslDialog} onChange={setWslDialog} onDistro={(d) => void fetchWslUsers(d, wslDialog)} onConnect={connectWsl} onClose={() => setWslDialog(null)} />}
      {updateDlg && (
        <div className="dialog-wrap" onMouseDown={() => { if (updateDlg.phase !== "downloading" && updateDlg.phase !== "verifying" && updateDlg.phase !== "launching") setUpdateDlg(null); }}>
          <div className="dialog" role="dialog" aria-label="Software update" style={{ width: 440 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="dialog-head"><span style={{ flex: 1 }}>Software update</span>
              <button className="icon-btn" onClick={() => setUpdateDlg(null)} aria-label="Close"><Icon name="x" /></button>
            </div>
            <div className="dialog-content" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {updateDlg.phase === "checking" && <p style={{ fontSize: 13 }}>Checking for updates…</p>}
              {updateDlg.phase === "uptodate" && <p style={{ fontSize: 13 }}>You have the latest version ({version}).</p>}
              {updateDlg.phase === "error" && updateDlg.error && <p className="inline-error" role="alert">{updateDlg.error}</p>}
              {updateDlg.phase === "available" && (
                <>
                  <p style={{ fontSize: 13 }}>Version {updateDlg.latest} is available (you have {version}).</p>
                  {updateDlg.notes && (
                    <pre style={{ fontSize: 12, whiteSpace: "pre-wrap", maxHeight: 160, overflow: "auto", color: "var(--text-muted)" }}>{updateDlg.notes.slice(0, 800)}</pre>
                  )}
                  <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    The installer is checksum-verified before it runs. Windows will still show a
                    SmartScreen warning — these builds are unsigned; check the version matches
                    before continuing.
                  </p>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button className="btn" onClick={() => setUpdateDlg(null)}>Later</button>
                    <button className="btn primary" onClick={() => void downloadUpdate()}>Download &amp; install</button>
                  </div>
                </>
              )}
              {(updateDlg.phase === "downloading" || updateDlg.phase === "verifying") && (
                <p style={{ fontSize: 13 }}>
                  {updateDlg.phase === "downloading"
                    ? `Downloading… ${(updateDlg.received / 1048576).toFixed(1)} MB${updateDlg.total ? ` of ${(updateDlg.total / 1048576).toFixed(1)} MB` : ""}`
                    : "Verifying installer…"}
                </p>
              )}
              {updateDlg.phase === "launching" && <p style={{ fontSize: 13 }}>Verified — launching the installer…</p>}
              {(updateDlg.phase === "uptodate" || updateDlg.phase === "error") && (
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button className="btn primary" onClick={() => setUpdateDlg(null)}>Close</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />
    </div>
  );
}

/** Picker label: `Name · Running|Stopped · WSL2` (+ default marker).
 * State/version are absent on the quiet fallback path — show honestly. */
function distroLabel(d: WslDistribution): string {
  const state = d.state ?? "Unknown";
  const version = d.version ? `WSL ${d.version}` : "WSL";
  const def = d.isDefault ? " (default)" : "";
  return `${d.name} · ${state} · ${version}${def}`;
}

function WslDialog({
  dialog,
  onChange,
  onDistro,
  onConnect,
  onClose,
}: {
  dialog: {
    distros: WslDistribution[]; distro: string;
    users: WslLinuxUser[]; linuxUser: string;
    usersLoading: boolean; usersError: string | null;
    path: string; error: string | null; connecting: boolean;
  };
  onChange: (d: {
    distros: WslDistribution[]; distro: string;
    users: WslLinuxUser[]; linuxUser: string;
    usersLoading: boolean; usersError: string | null;
    path: string; error: string | null; connecting: boolean;
  }) => void;
  onDistro: (distro: string) => void;
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
                  value={dialog.distro} onChange={(e) => onDistro(e.target.value)}
                >
                  {dialog.distros.map((d) => <option key={d.name} value={d.name}>{distroLabel(d)}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 13 }}>Linux user
                <select
                  className="input" style={{ marginTop: 4 }}
                  value={dialog.linuxUser}
                  disabled={dialog.usersLoading || dialog.users.length === 0}
                  onChange={(e) => onChange({ ...dialog, linuxUser: e.target.value })}
                  aria-label="Linux user"
                >
                  {dialog.users.map((u) => (
                    <option key={u.username} value={u.username}>
                      {u.username}{u.isDefault ? " (default)" : ""} — {u.home}
                    </option>
                  ))}
                </select>
              </label>
              {dialog.usersLoading && <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Loading Linux users…</p>}
              {dialog.usersError && <p className="inline-error" role="alert">{dialog.usersError}</p>}
              {!dialog.usersLoading && !dialog.usersError && dialog.users.length === 0 && (
                <p style={{ fontSize: 13 }}>No interactive users found in this distribution.</p>
              )}
              <label style={{ fontSize: 13 }}>Folder in {dialog.distro || "WSL"}
                <input
                  className="input" style={{ marginTop: 4 }}
                  value={dialog.path} onChange={(e) => onChange({ ...dialog, path: e.target.value })}
                  placeholder="~/notes" aria-label="WSL folder path"
                />
              </label>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn" onClick={onClose}>Cancel</button>
                <button className="btn primary" disabled={!dialog.distro || !dialog.linuxUser || dialog.connecting} onClick={onConnect}>
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
