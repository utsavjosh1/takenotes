import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import { resolveTheme } from "@takenotes/ui";
import { Button, EmptyState, IconButton, Notice } from "@takenotes/ui/dom";
import type { DirectoryEntry, WorkspaceInfo } from "@takenotes/contracts/ipc";
import type { CommandId } from "@takenotes/core/commands/registry";
import { usePlatform } from "./hooks/use-platform";
import { isWslKind } from "@takenotes/platform/filesystem";
import { TitleBar, ActivityRail, StatusBar, type SidebarView } from "./components/chrome";
import { PaneView } from "./components/pane-view";
// NOTE: Single-surface Markdown WYSIWYG (ADR-0015) — the editor surface
// renders Markdown live (marks hidden, tasks as checkboxes, tables,
// callouts, code, and media styled in place) and the doc stays plain
// Markdown. There is no read/edit mode and no toggle.
import { workspaceIndex } from "./index/workspace-index";
import { uniqueCopyName, resolveCreateTarget } from "@takenotes/core/explorer/sort";
import { closeWorkspaceFlow, openWorkspaceFlow, refreshWorkspaceFlow, resolveWikilinkTarget } from "./workspace-flows";
import { paneDocs } from "./panes";
import { indexedEntryToQuickOpenItem } from "@takenotes/core/commands/palette";
import { FileTree } from "./components/tree";
import { FavoritesPane } from "./components/favorites";
import { OutlinePane, PreviewCard } from "./components/outline";
import { lineForBlockId, lineForHeadingFragment, previewExcerpt } from "@takenotes/core/outline/extract";
import { renderMarkdown } from "@takenotes/core/markdown/render";
import { SearchPanel } from "./components/search";
import { ContextMenu, Toasts, TabStrip } from "./components/overlays";
import { CommandMenu } from "./components/palette";
import { SettingsDialog } from "./components/settings";
import { WslDialog } from "./components/wsl-dialog";
import { UpdateDialog } from "./components/update-dialog";
import { HistoryDialog } from "./components/history-dialog";
import { buildFileMenu, buildSidebarMenu, buildTabMenu, type MenuOps } from "./components/menus";
import { Icon } from "./components/icons";
import { getBridge } from "./bridge";
import lockupDarkUrl from "./assets/brand/takenotes-lockup-dark.svg";
import lockupLightUrl from "./assets/brand/takenotes-lockup-light.svg";
import { fileName, type CtxMenu } from "./components/types";
import { useToastStore } from "./stores/toasts";
import { useSettingsStore } from "./stores/settings";
import { useIndexMeta } from "./stores/index-meta";
import { useNotify } from "./hooks/use-notify";
import { useRecents } from "./hooks/use-recents";
import { useWorkspace } from "./hooks/use-workspace";
import { useDocuments, type DocumentsApi } from "./hooks/use-documents";
import { useFileTree, type FileTreeApi } from "./hooks/use-file-tree";
import { useSearch, type SearchApi } from "./hooks/use-search";
import { useWslConnect } from "./hooks/use-wsl-connect";
import { useUpdates } from "./hooks/use-updates";
import { useCommands } from "./hooks/use-commands";
import { useFavorites } from "./hooks/use-favorites";
import { useGlobalKeyboard } from "./hooks/use-global-keyboard";
import { useHotkeys } from "./hooks/use-hotkeys";
import type { DocumentIndexEntry } from "@takenotes/core/index/document";

/** Body-only text for previews. `searchableText` prefixes title, aliases,
 * headings and tags before the body — slicing the known prefix keeps the
 * ~20-line excerpt budget on actual note content. */
function previewBodyText(entry: DocumentIndexEntry): string {
  const prefixLines = 1 + entry.aliases.length + entry.headings.length + entry.tags.length;
  return entry.searchableText.split("\n").slice(prefixLines).join("\n");
}

/** Composition root. Owns only shell-level UI state (view, sidebar,
// palette, menus, dialogs visibility, version) and cross-domain
 * choreography (workspace open/close flows). Every feature domain —
 * documents, tree, search, recovery, WSL, updates, commands — owns its
 * state in its hook; App wires them together and renders. */
export default function App(): JSX.Element {
  const platform = usePlatform();
  const hotkeys = useHotkeys(platform.platform);
  const sc = (id: CommandId): string => hotkeys.labelFor(id) || platform.shortcutLabel(id);
  const notify = useNotify();
  const { toast } = notify;
  const settings = useSettingsStore((s) => s.settings);
  const setSettings = useSettingsStore((s) => s.setAll);
  const toasts = useToastStore((s) => s.toasts);
  const dismissToast = useToastStore((s) => s.dismiss);
  const indexVersion = useIndexMeta((s) => s.version);
  const indexNotice = useIndexMeta((s) => s.notice);
  const bumpIndex = useIndexMeta((s) => s.bump);

  // Shell UI state: local, single-component, never leaves App.
  const [view, setView] = useState<SidebarView>("files");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem("takenotes.sidebarWidth") ?? 256) || 256);
  // Per-pane collapse (Step 2 shell seam): one flag per left pane, persisted.
  const [paneCollapsed, setPaneCollapsed] = useState<Record<SidebarView, boolean>>(() => {
    try {
      return { files: false, search: false, outline: false, favorites: false, ...JSON.parse(localStorage.getItem("takenotes.paneCollapsed") ?? "{}") };
    } catch {
      return { files: false, search: false, outline: false, favorites: false };
    }
  });
  const togglePaneCollapse = useCallback((v: SidebarView) => {
    setPaneCollapsed((p) => {
      const next = { ...p, [v]: !p[v] };
      try { localStorage.setItem("takenotes.paneCollapsed", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);
  const [palette, setPalette] = useState<{ initialQuery: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menu, setMenu] = useState<CtxMenu>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [version, setVersion] = useState("0.0.1");
  const dragResize = useRef<{ startX: number; startW: number } | null>(null);

  const recents = useRecents();
  const refreshRecentWorkspaces = useCallback(() => {
    const bridge = getBridge();
    if (!bridge) return;
    void bridge.workspace.listRecent().then((res) => {
      if (res.ok) recents.setRecentWorkspaces(res.result);
    }).catch(() => undefined);
  }, [recents.setRecentWorkspaces]);

  // Cross-hook choreography refs: workspace open/close fan out to other
  // domains. Refs (not props) keep the domain hooks acyclic — each hook
  // owns its state, App owns the flow between them.
  const docsRef = useRef<DocumentsApi | null>(null);
  const treeRef = useRef<FileTreeApi | null>(null);
  const searchRef = useRef<SearchApi | null>(null);
  const workspaceHooks = useMemo(() => ({
    // Lifecycle choreography lives in `workspace-flows.ts` (pure logic,
    // tested in tests/renderer/workspace-flows.test.ts). Refs keep the
    // domain hooks acyclic; every load takes `ws` explicitly (C1) and
    // teardown precedes every open (H5, I-WS-3).
    onOpened: async (ws: WorkspaceInfo) => {
      if (!docsRef.current || !treeRef.current || !searchRef.current) return;
      await openWorkspaceFlow(
        {
          docs: docsRef.current,
          tree: treeRef.current,
          search: searchRef.current,
          recordWorkspace: () => undefined,
        },
        ws,
      );
      refreshRecentWorkspaces();
    },
    onClosed: () => {
      if (!docsRef.current || !treeRef.current || !searchRef.current) return;
      closeWorkspaceFlow({
        docs: docsRef.current,
        tree: treeRef.current,
        search: searchRef.current,
        recordWorkspace: () => undefined,
      });
    },
  }), [refreshRecentWorkspaces]);
  const workspaceApi = useWorkspace(notify, workspaceHooks);
  const workspace = workspaceApi.workspace;

  useEffect(() => {
    refreshRecentWorkspaces();
  }, [refreshRecentWorkspaces]);

  const docsApi = useDocuments(workspace, notify, recents);
  const treeApi = useFileTree(workspace, docsApi, notify, workspaceApi.reportHealth);
  const favoritesApi = useFavorites(workspace, notify);
  const favFilesLower = useMemo(() => new Set(treeApi.allFiles.map((f) => f.relativePath.toLowerCase())), [treeApi.allFiles]);
  const favDirsLower = useMemo(() => {    const s = new Set<string>();
    const walk = (list: DirectoryEntry[]): void => {
      for (const e of list) {
        if (e.kind === "directory") {
          s.add(e.relativePath.toLowerCase());
          const kids = treeApi.tree.children.get(e.relativePath);
          if (kids) walk(kids);
        }
      }
    };
    walk(treeApi.entries);
    return s;
  }, [treeApi.entries, treeApi.tree.children]);

  // Step 2 Page Preview lookup: resolved target → first-20-lines excerpt
  // rendered via the shared reference renderer + full-path footer.
  // Index-backed (no IO); targets outside the index show nothing.
  // Previews use the note BODY, not searchableText (which prefixes title,
  // aliases, headings and tags and would spend the excerpt on metadata).
  const previewForTarget = useCallback((target: string): { html: string; fullPath: string } | null => {
    const ws = workspaceApi.workspace;
    if (!ws) return null;
    const rel = resolveWikilinkTarget(target, treeApi.allFiles.map((f) => f.relativePath));
    if (!rel) return null;
    const entry = workspaceIndex.get(ws.workspaceId, rel);
    if (!entry) return null;
    return { html: renderMarkdown(previewExcerpt(previewBodyText(entry))).html, fullPath: rel };
  }, [workspaceApi.workspace, treeApi.allFiles]);

  // Explorer hover preview (same lookup, 400ms hover, card in App root).
  const [hoverCard, setHoverCard] = useState<{ html: string; fullPath: string; x: number; y: number } | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const clearHover = useCallback(() => {
    if (hoverTimer.current !== null) { window.clearTimeout(hoverTimer.current); hoverTimer.current = null; }
    setHoverCard(null);
  }, []);
  const hoverFilePreview = useCallback((rel: string, x: number, y: number) => {
    clearHover();
    hoverTimer.current = window.setTimeout(() => {
      hoverTimer.current = null;
      const ws = workspaceApi.workspace;
      if (!ws) return;
      const entry = workspaceIndex.get(ws.workspaceId, rel);
      if (!entry) return;
      setHoverCard({ html: renderMarkdown(previewExcerpt(previewBodyText(entry))).html, fullPath: rel, x, y });
    }, 400);
  }, [clearHover, workspaceApi.workspace]);

  const gotoLine = useCallback((line: number) => {
    window.dispatchEvent(new CustomEvent("takenotes:goto-line", { detail: line }));
  }, []);
  const searchApi = useSearch(workspace, docsApi.layout, notify, workspaceApi.reportHealth);
  docsRef.current = docsApi;
  treeRef.current = treeApi;
  searchRef.current = searchApi;

  // WSL is an opt-in Settings feature: entry points render only when the
  // platform supports WSL *and* the user enabled it. An already-open WSL
  // workspace keeps working when toggled off; only new connects hide.
  const wslFeature = platform.capabilities.wsl && settings.wslEnabled;
  const wslApi = useWslConnect(notify, (ws) => workspaceApi.openWorkspace(ws));
  // Stable identity: an inline closure here would recreate updatesApi.check
  // on every render and re-run the startup effect (IPC storm + dialog reset).
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const updatesApi = useUpdates(notify, platform.capabilities.updates, closeSettings);

  // One logical "refresh workspace" operation (M4): every user-facing
  // refresh entry point (menu, palette, reconnect) delegates here so tree
  // root, file enumeration, and search index stay in sync.
  const refreshWorkspace = useCallback(() => {
    void refreshWorkspaceFlow({ tree: treeApi, search: searchApi }, workspaceApi.workspace);
  }, [workspaceApi.workspace, treeApi, searchApi]);

  useEffect(() => {
    const bridge = getBridge();
    if (!bridge || !workspace) return;
    return bridge.events.onWorkspaceChange((event) => {
      if (event.workspaceId !== workspace.workspaceId) return;
      void refreshWorkspaceFlow({ tree: treeApi, search: searchApi }, workspace);
      if (event.relativePath) void docsApi.reconcileExternalChange(event.relativePath);
    });
  }, [workspace, treeApi, searchApi, docsApi]);

  const commandsApi = useCommands({
    workspace,
    docs: docsApi,
    tree: treeApi,
    platform,
    wslEnabled: settings.wslEnabled,
    openLocal: () => void workspaceApi.openLocal(),
    openWslDialog: () => void wslApi.open(),
    closeWorkspace: () => void workspaceApi.closeWorkspace(),
    refreshAll: refreshWorkspace,
    checkUpdates: () => void updatesApi.check(true),
    setView,
    setSidebarOpen,
    toggleFocusMode: () => setFocusMode((v) => !v),
    openSettings: () => setSettingsOpen(true),
    openPalette: (q) => setPalette({ initialQuery: q }),
    shortcutLabel: (id) => hotkeys.labelFor(id) || platform.shortcutLabel(id),
    addActiveToFavorites: () => {
      const tab = docsApi.activeTab;
      if (!tab) return;
      const group = favoritesApi.doc.groups[0]?.name ?? "default";
      void favoritesApi.addEntry(group, { type: "file", target: tab.relativePath });
    },
  });

  useGlobalKeyboard({
    paletteOpen: palette !== null,
    platform,
    tree: treeApi,
    docs: docsApi,
    executeCommand: commandsApi.executeCommand,
    hotkeyOverrides: hotkeys.overrides,
  });

  useEffect(() => {
    localStorage.setItem("takenotes.settings", JSON.stringify(settings));
    document.documentElement.dataset.theme = resolveTheme(settings.theme, window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
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
    return () => mq.removeEventListener("change", onChange);
  }, [settings.theme]);

  // Mount-only: version label + silent startup update check (ADR-0006).
  // Kept separate from the theme listener above so renders (and theme
  // switches) never re-fire IPC update checks or reset dialog progress.
  useEffect(() => {
    const bridge = getBridge();
    if (bridge) void bridge.app.version().then((r) => { if (r.ok) setVersion(r.result); }).catch(() => undefined);
    // Silent startup update check (ADR-0006): main enforces the 24h cadence
    // and offline silence; an available update opens the dialog.
    void updatesApi.check(false).catch(() => undefined);
    // updatesApi.check is stable (closeSettings is memoized), so this runs once.
  }, []);

  const menuOps: MenuOps = useMemo(() => ({
    openFile: (rel) => void docsApi.openFile(rel),
    beginRename: (rel) => treeApi.beginRename(rel),
    removeEntry: (entry) => void treeApi.removeEntry(entry),
    trashEntry: (entry) => void treeApi.removeEntry(entry),
    beginCreate: (dir, folder) => folder ? treeApi.beginCreate(dir, true) : void treeApi.createUntitledNote(dir),
    select: (rel) => treeApi.select(rel),
    closeTab: (key) => docsApi.closeTab(key),
    togglePinnedTab: (key) => docsApi.togglePinnedTab(key),
    executeCommand: (id) => commandsApi.executeCommand(id),
    refreshAll: () => refreshWorkspace(),
    openLocal: () => void workspaceApi.openLocal(),
    addFavorite: (entry) => {
      const group = favoritesApi.doc.groups[0]?.name ?? "default";
      void favoritesApi.addEntry(group, entry.kind === "directory"
        ? { type: "folder", target: entry.relativePath }
        : { type: "file", target: entry.relativePath });
    },
  }), [docsApi, treeApi, commandsApi.executeCommand, workspaceApi, refreshWorkspace, favoritesApi]);

  const showFileMenu = useCallback((e: React.MouseEvent, entry: DirectoryEntry) => {
    e.preventDefault();
    e.stopPropagation();
    const ws = workspaceApi.workspace;
    if (!ws) return;
    setMenu(buildFileMenu(e, entry, {
      workspaceId: ws.workspaceId, workspaceType: ws.type, platform, shortcut: sc, ops: menuOps,
    }));
  }, [workspaceApi.workspace, platform, menuOps]);

  const showTabMenu = useCallback((key: string, e: React.MouseEvent) => {
    e.preventDefault();
    setMenu(buildTabMenu(e, key, docsApi.layout, { shortcut: sc, ops: menuOps }));
  }, [docsApi.layout, menuOps]);

  const quickOpenFiles = useMemo(
    () => (workspace ? workspaceIndex.list(workspace.workspaceId).map(indexedEntryToQuickOpenItem) : []),
    [workspace?.workspaceId, indexVersion],
  );

  /* ---------- render ---------- */
  // Browser-tab mode: vite serves the same bundle to Electron AND to plain
  // browsers. Only Electron injects the preload bridge, so a browser tab can
  // never open files — say exactly that and where to go instead.
  const bridgeBanner = platform.bridgeMissing && (
    <Notice className="pane-notice" tone="warning" announcement="polite" title="Opened in a browser tab — file access needs the desktop window">
      This tab has no desktop bridge (expected: browsers can&apos;t load Electron preloads). Use the desktop window opened by <kbd className="k">npm run dev</kbd> —
      not this URL. For the browser demo instead, run <kbd className="k">npm run dev:web</kbd>.
    </Notice>
  );
  if (!workspace) {
    return (
      <div className="app">
        {bridgeBanner}
        <TitleBar workspace={null} platform={platform} wslEnabled={settings.wslEnabled} onQuickOpen={() => {}} onOpenWindows={() => void workspaceApi.openLocal()} onOpenWsl={() => void wslApi.open()} />
        <EmptyState className="welcome-state" headingLevel={1} title="Open a workspace" description="Choose a folder of Markdown files."
          illustration={<>
            <img src={lockupDarkUrl} className="brand-logo only-dark" alt="takenotes" draggable={false} />
            <img src={lockupLightUrl} className="brand-logo only-light" alt="takenotes" draggable={false} />
          </>}
          actions={<>
            <Button variant="primary" onClick={() => void workspaceApi.openLocal()}>Open folder</Button>
            {wslFeature && <Button onClick={() => void wslApi.open()}>Open WSL folder</Button>}
          </>}>
          <p className="supporting-copy">Your notes stay in the folder you choose.</p>
          {recents.recentWorkspaces.length > 0 && (
            <>
              <hr className="sect-sep" />
              <div className="recent-list">
                <div className="panel-title" style={{ paddingLeft: 12 }}>Recent</div>
                {recents.recentWorkspaces.map((r, index) => {
                  const name = "displayName" in r ? r.displayName : r.name;
                  const kind = "type" in r ? r.type : r.kind;
                  const id = "id" in r ? r.id : undefined;
                  return (
                    <button key={id ?? `${name}-${index}`} className="recent-item" onClick={() => id ? void workspaceApi.openRecent(id) : void workspaceApi.openLocal()} title={id ? "Reopen workspace" : "Reopen via folder picker"}>
                      <span className="n">{name}</span>
                      <span className="d">{kind === "windows-wsl" ? "WSL" : kind === "macos-local" ? "macOS" : kind === "linux-local" ? "Linux" : "Windows"}</span>
                    </button>
                  );
                })}
                <button className="recent-item" onClick={() => void workspaceApi.openLocal()}><span className="n" style={{ color: "var(--accent)" }}>Open other folder…</span></button>
              </div>
            </>
          )}
        </EmptyState>
        {wslApi.dialog && <WslDialog dialog={wslApi.dialog} onDistro={(d) => void wslApi.fetchUsers(d)} onConnect={(data) => void wslApi.connect(data)} onClose={wslApi.close} />}
        <Toasts toasts={toasts} onDismiss={dismissToast} />
      </div>
    );
  }

  const healthError = workspaceApi.healthError;
  return (
    <div className="app">
      {bridgeBanner}
      {!focusMode && (
        <TitleBar workspace={workspace} platform={platform} wslEnabled={settings.wslEnabled} onQuickOpen={() => commandsApi.executeCommand("quickOpen.open")} onOpenWindows={() => void workspaceApi.openLocal()} onOpenWsl={() => void wslApi.open()} />
      )}
      <div className="body">
        {!focusMode && settings.ribbonVisible && (
          <ActivityRail view={view} platform={platform} onView={(v) => { setView(v); setSidebarOpen(true); }} onSettings={() => setSettingsOpen(true)} />
        )}
        {!focusMode && sidebarOpen && (
          <>
            <aside className="sidebar" style={{ width: Math.min(360, Math.max(200, sidebarWidth)) }} aria-label="Sidebar">
              <div className="sidebar-head" title={workspace.displayName}>
                <span className="name">{workspace.displayName}
                  {isWslKind(workspace.type) && <span className="sub">WSL{workspace.linuxUser ? ` · ${workspace.linuxUser}` : ""}</span>}
                </span>
                <IconButton title={`New note (${sc("note.new")})`} label="New note" onClick={() => commandsApi.executeCommand("note.new")}><Icon name="plus" /></IconButton>
                <label className="sort-control">Sort
                  <select
                    aria-label="Explorer sort"
                    value={`${treeApi.sort.key}:${treeApi.sort.dir}`}
                    onChange={(e) => {
                      const [key, dir] = e.target.value.split(":") as ["name" | "modified" | "created", "asc" | "desc"];
                      treeApi.setSort({ key, dir });
                    }}
                  >
                    <option value="name:asc">Name ↑</option>
                    <option value="name:desc">Name ↓</option>
                    <option value="modified:desc">Modified ↓</option>
                    <option value="modified:asc">Modified ↑</option>
                    <option value="created:desc">Created ↓</option>
                    <option value="created:asc">Created ↑</option>
                  </select>
                </label>
                <IconButton label="More actions"
                  onClick={(e) => setMenu(buildSidebarMenu(e, { shortcut: sc, ops: menuOps }))}
                ><Icon name="more" /></IconButton>
                <IconButton label={paneCollapsed[view] ? "Expand pane" : "Collapse pane"} onClick={() => togglePaneCollapse(view)}>
                  <Icon name={paneCollapsed[view] ? "chevronRight" : "chevronDown"} />
                </IconButton>
              </div>
              <div
                className="sidebar-body"
                onKeyDown={treeApi.onTreeKeyDown}
                onDragOver={(e) => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
                onDrop={(e) => {
                  if (!e.dataTransfer.files.length) return;
                  e.preventDefault();
                  void (async () => {
                    const ws = workspaceApi.workspace;
                    const bridge = getBridge();
                    if (!ws || !bridge) return;
                    const dir = treeApi.preferredNewNoteDir();
                    const existing = new Set(treeApi.allFiles.map((f) => f.relativePath.toLowerCase()));
                    let imported = 0;
                    for (const file of Array.from(e.dataTransfer.files)) {
                      if (!/\.(md|markdown|txt)$/i.test(file.name)) {
                        toast(`"${file.name}" skipped — binary import arrives with Step 4 attachments.`);
                        continue;
                      }
                      // Collisions are per-directory: compare against sibling
                      // basenames, not full workspace-relative paths.
                      const prefix = dir ? `${dir}/`.toLowerCase() : "";
                      const siblings = new Set(
                        [...existing]
                          .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"))
                          .map((p) => p.slice(prefix.length)),
                      );
                      const name = uniqueCopyName(file.name.replace(/\.[^.]+$/, ".md"), siblings);
                      const rel = dir ? `${dir}/${name}` : name;
                      const created = await bridge.file.create(ws.workspaceId, rel);
                      if (!created.ok) { toast(`Couldn't import "${file.name}".`); continue; }
                      const content = await file.text();
                      const written = await bridge.file.write({ workspaceId: ws.workspaceId, relativePath: rel, content, expectedHash: created.result.hash, newlineStyle: "lf", hadBom: false });
                      if (!written.ok) { toast(`Couldn't import "${file.name}".`); continue; }
                      workspaceIndex.upsert(ws.workspaceId, rel, content, written.result);
                      existing.add(rel.toLowerCase());
                      imported++;
                    }
                    if (imported > 0) {
                      bumpIndex();
                      await refreshWorkspaceFlow({ tree: treeApi, search: searchApi }, ws);
                    }
                  })();
                }}
              >
                {paneCollapsed[view] ? (
                  <div className="panel-title">{view === "files" ? "Explorer" : view === "search" ? "Search" : view === "outline" ? "Outline" : "Favorites"} (collapsed)</div>
                ) : view === "files" ? (
                  <>
                    {treeApi.creating && (
                      <div className="tree-row" style={{ paddingLeft: 12 }}>
                        <input
                          className="rename-input"
                          autoFocus
                          placeholder={treeApi.creating.folder ? "folder-name" : "note-name"}
                          value={treeApi.createName}
                          aria-label={treeApi.creating.folder ? "New folder name" : "New note name"}
                          onChange={(e) => treeApi.setCreateName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void treeApi.commitCreate();
                            else if (e.key === "Escape") treeApi.cancelCreate();
                            e.stopPropagation();
                          }}
                          onBlur={() => { if (treeApi.createName.trim()) void treeApi.commitCreate(); else treeApi.cancelCreate(); }}
                        />
                      </div>
                    )}
                    {treeApi.sidebarLoading ? (
                      <div className="panel-title">Opening…</div>
                    ) : healthError ? (
                      <div style={{ padding: 12 }}>
                        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Couldn&apos;t list this workspace.</p>
                        <p className="inline-error">{healthError}</p>
                      </div>
                    ) : (
                      <FileTree
                        entries={treeApi.entries}
                        tree={treeApi.tree}
                        activePath={docsApi.activeTab?.relativePath ?? null}
                        onToggle={(d) => void treeApi.toggleDir(d)}
                        onOpen={(en) => {
                          if (en.fileClass === "markdown" || en.fileClass === "text") { void docsApi.openFile(en.relativePath).then(() => void treeApi.reveal(en.relativePath)); }
                          else toast("Only Markdown and text files open in the editor in this MVP.");
                        }}
                        onSelect={(rel) => treeApi.select(rel)}
                        onContext={showFileMenu}
                        onRenameCommit={(en, n) => void treeApi.commitRename(en, n)}
                        onRenameCancel={() => treeApi.cancelRename()}
                        onHoverFile={(rel, x, y) => hoverFilePreview(rel, x, y)}
                        onHoverEnd={() => clearHover()}
                      />
                    )}
                  </>
                ) : view === "search" ? (
                  <SearchPanel
                    query={searchApi.query}
                    onQuery={searchApi.setQuery}
                    searching={searchApi.searching}
                    searchError={searchApi.searchError}
                    filenameHits={searchApi.filenameHits}
                    contentHits={searchApi.contentHits}
                    notice={indexNotice}
                    onOpen={(rel, line) => {
                      void docsApi.openFile(rel).then(() => {
                        if (line) toast(`Jumped to line ${line}. In-editor scroll lands with Stage 7.`);
                      });
                    }}
                  />
                ) : view === "outline" ? (
                  <OutlinePane content={docsApi.activeTab?.content ?? null} onNavigate={gotoLine} />
                ) : (
                  <FavoritesPane
                    doc={favoritesApi.doc}
                    favorites={favoritesApi}
                    files={favFilesLower}
                    dirs={favDirsLower}
                    open={{
                      openFile: (rel) => { void docsApi.openFile(rel).then(() => void treeApi.reveal(rel)); },
                      revealDir: (rel) => {
                        setView("files");
                        setSidebarOpen(true);
                        if (!treeApi.tree.expanded.has(rel)) void treeApi.toggleDir(rel);
                        treeApi.select(rel);
                      },
                      runSearch: (query) => { setView("search"); setSidebarOpen(true); searchApi.setQuery(query); },
                    }}
                    openAnchor={(rel, frag, isBlock) => {
                      void (async () => {
                        await docsApi.openFile(rel);
                        await treeApi.reveal(rel);
                        const bridge = getBridge();
                        const ws = workspaceApi.workspace;
                        if (!bridge || !ws) return;
                        const read = await bridge.file.read(ws.workspaceId, rel);
                        if (!read.ok) return;
                        const line = isBlock
                          ? lineForBlockId(read.result.content, frag)
                          : lineForHeadingFragment(read.result.content, frag);
                        if (line) gotoLine(line);
                      })();
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
                  setSidebarWidth(Math.min(360, Math.max(200, dragResize.current.startW + ev.clientX - dragResize.current.startX)));
                };
                const onUp = (): void => {
                  dragResize.current = null;
                  window.removeEventListener("mousemove", onMove);
                  window.removeEventListener("mouseup", onUp);
                };
                window.addEventListener("mousemove", onMove);
                window.addEventListener("mouseup", onUp);
              }}
              onDoubleClick={() => setSidebarWidth(256)}
            />
          </>
        )}
        <main className="main">
          {healthError && (
            <Notice className="pane-notice" tone="danger" announcement="assertive" title="Workspace unavailable"
              actions={<Button onClick={() => refreshWorkspace()}>Reconnect</Button>}>
              {healthError}
            </Notice>
          )}
          {(() => {
            const docs = paneDocs(docsApi.layout);
            const doc = docsApi.activeTab;
            const rec = doc ? docsApi.recovery[doc.key] : undefined;
            return (
              <section
                className="pane active"
                aria-label="Editor"
                onDragOver={(e) => { if (e.dataTransfer.types.includes("takenotes/rel-path")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
                onDrop={(e) => {
                  const rel = e.dataTransfer.getData("takenotes/rel-path");
                  if (!rel) return;
                  e.preventDefault();
                  window.dispatchEvent(new CustomEvent("takenotes:insert-link", { detail: rel }));
                }}
              >
                {!focusMode && (
                  <TabStrip
                    tabs={docs}
                    activeKey={docsApi.layout.activeKey}
                    onActivate={(k) => docsApi.activateDocKey(k)}
                    onClose={(k) => docsApi.closeTab(k)}
                    onContext={(e, k) => showTabMenu(k, e)}
                    onReorder={(from, to) => docsApi.reorderTabs(from, to)}
                  />
                )}
                {doc && rec && (
                  <Notice className="pane-notice" tone="warning" announcement="polite" title="An unsaved draft is available"
                    actions={<>
                      <Button onClick={() => docsApi.restoreDraft(doc.key)}>Restore draft</Button>
                      <Button variant="destructive" onClick={() => void docsApi.discardDraft(doc.key)}>Discard draft</Button>
                    </>}>
                    {rec.diskChanged
                      ? `${fileName(doc.relativePath)} changed since this draft was kept. Choose which version to use.`
                      : `Draft from ${new Date(rec.updatedAt).toLocaleString()}. Not saved to file.`}
                    {rec.stale ? " This draft is over 30 days old." : ""}
                  </Notice>
                )}
                {doc?.conflict && (
                  <Notice className="pane-notice" tone="warning" announcement="assertive" title="File changed outside takenotes"
                    actions={<>
                      <Button onClick={() => void docsApi.reloadFromDisk(doc.key)}>Reload from disk</Button>
                      <Button onClick={() => void docsApi.keepMyVersion(doc.key)}>Keep my version</Button>
                    </>}>
                    Your edits to {fileName(doc.relativePath)} are still open. Choose which version to use.
                  </Notice>
                )}
                {!doc ? (
                  <EmptyState className="pane-empty" title="Choose a note to start writing."
                    description={<><kbd className="k">{sc("quickOpen.open")}</kbd> Quick open · <kbd className="k">{sc("note.new")}</kbd> New note</>}
                    actions={treeApi.entries.length === 0 && !treeApi.sidebarLoading ? <Button variant="primary" onClick={commandsApi.newNote}>Create note</Button> : undefined} />
                ) : doc.loadError ? (
                  <EmptyState className="pane-empty" title={`Couldn’t open ${fileName(doc.relativePath)}`}
                    description={`${doc.loadError} Your file is untouched.`}
                    actions={<Button onClick={() => docsApi.closeTab(doc.key)}>Close tab</Button>} />
                ) : (
                  <PaneView
                    docKey={doc.key}
                    content={doc.content}
                    relativePath={doc.relativePath}
                    lineNumbers={settings.lineNumbers}
                    wordWrap={settings.wordWrap}
                    fullWidth={settings.fullWidth}
                    reportCursor
                    onEdit={docsApi.onEdit}
                    onCursor={docsApi.handleCursor}
                    onTitleCommit={async (title) => {
                      const changed = await docsApi.renameNoteTitle(doc.key, title);
                      if (changed && workspace) await refreshWorkspaceFlow({ tree: treeApi, search: searchApi }, workspace);
                    }}
                    onOpenWikilink={(target) => {
                      const rel = resolveWikilinkTarget(target, treeApi.allFiles.map((f) => f.relativePath));
                      if (rel) void docsApi.openFile(rel).then(() => void treeApi.reveal(rel));
                    }}
                    onHoverLink={(target, x, y) => {
                      if (!target) { clearHover(); return; }
                      const found = previewForTarget(target);
                      if (found) setHoverCard({ ...found, x, y });
                    }}                  />
                )}
              </section>
            );
          })()}
        </main>
      </div>
      {!focusMode && (
        <StatusBar
          workspace={workspace}
          words={docsApi.words}
          line={docsApi.cursor.line}
          col={docsApi.cursor.col}
          doc={docsApi.saveView}
          savedAt={docsApi.activeTab?.savedAt ?? ""}
          connection={healthError ? "disconnected" : workspace.connection}
          fileCount={treeApi.allFiles.length}
          indexWarning={indexNotice}
          onOpenHistory={docsApi.activeTab ? () => void docsApi.openHistory(docsApi.activeTab!.key) : undefined}
        />
      )}
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      {palette && (
        <CommandMenu
          initialQuery={palette.initialQuery}
          files={quickOpenFiles}
          recents={recents.recents}
          commands={commandsApi.commands}
          recentCommands={commandsApi.recentCommands}
          onOpenFile={(rel) => { commandsApi.remember("quickOpen.open"); void docsApi.openFile(rel).then(() => void treeApi.reveal(rel)); }}
          onCreateFile={(name) => {
            commandsApi.remember("quickOpen.open");
            void (async () => {
              const ws = workspaceApi.workspace;
              const bridge = getBridge();
              if (!ws || !bridge) return;
              const target = resolveCreateTarget(name, treeApi.preferredNewNoteDir());
              if (!target.ok) { toast(target.error); return; }
              const created = await bridge.file.create(ws.workspaceId, target.rel);
              if (!created.ok) { toast(`Couldn't create "${target.rel}".`); return; }
              workspaceIndex.upsert(ws.workspaceId, target.rel, "", created.result);
              bumpIndex();
              await refreshWorkspaceFlow({ tree: treeApi, search: searchApi }, ws);
              await docsApi.openFile(target.rel);
              await treeApi.reveal(target.rel);
            })();
          }}
          onClose={() => setPalette(null)}
        />
      )}
      {settingsOpen && (
        <SettingsDialog settings={settings} onChange={setSettings} version={version} platform={platform} hotkeys={hotkeys} updatesEnabled={platform.capabilities.updates} onCheckUpdates={() => void updatesApi.check(true)} onClose={() => setSettingsOpen(false)} />
      )}
      {docsApi.historyDialog && (
        <HistoryDialog
          dialog={docsApi.historyDialog}
          onClose={docsApi.closeHistory}
          onRestore={(id) => void docsApi.restoreRecoverySnapshot(id)}
          onCopy={(id) => void docsApi.copyRecoverySnapshot(id)}
        />
      )}
      {wslApi.dialog && <WslDialog dialog={wslApi.dialog} onDistro={(d) => void wslApi.fetchUsers(d)} onConnect={(data) => void wslApi.connect(data)} onClose={wslApi.close} />}
      {updatesApi.dialog && (
        <UpdateDialog dialog={updatesApi.dialog} version={version} onClose={updatesApi.close} onDownload={() => void updatesApi.download()} />
      )}
      {hoverCard && (
        <PreviewCard html={hoverCard.html} fullPath={hoverCard.fullPath} x={hoverCard.x} y={hoverCard.y} />
      )}
      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
