import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import { resolveTheme } from "@takenotes/ui";
import { appearanceVars, clampZoom, stepZoom, type AppearanceTheme } from "@takenotes/core/appearance/appearance";
import { Button, Dialog, EmptyState, IconButton, Notice } from "@takenotes/ui/dom";
import type { DirectoryEntry, WorkspaceInfo } from "@takenotes/contracts/ipc";
import type { CommandId } from "@takenotes/core/commands/registry";
import { usePlatform } from "./hooks/use-platform";
import { WelcomeScreen, readRecentServers, rememberServer, type RecentServer } from "./components/welcome";
import { CreateWorkspaceDialog, PairDialog, ServerSignInDialog } from "./components/workspace-dialogs";
import { ErrorDialog } from "@takenotes/ui/dom";
import { WorkspaceSwitcher } from "./components/ws-switcher";
import type { RecentWorkspaceInfo } from "@takenotes/contracts/ipc";
import { PAGE_VIEWS, PageShell, TasksPage, TodayPage, type PageView } from "./components/pages";
import { TitleBar, ActivityRail, StatusBar, VIEW_TITLES, type SidebarView } from "./components/chrome";
import { PaneView } from "./components/pane-view";
// NOTE: Single-surface Markdown WYSIWYG (ADR-0015) — the editor surface
// renders Markdown live (marks hidden, tasks as checkboxes, tables,
// callouts, code, and media styled in place) and the doc stays plain
// Markdown. There is no read/edit mode and no toggle.
import { buildWorkspaceIndex, syncFileIndex, workspaceIndex } from "./index/workspace-index";
import { uniqueCopyName, resolveCreateTarget } from "@takenotes/core/explorer/sort";
import {
  attachmentFileName,
  buildAttachmentLink,
  classifyAttachment,
  pastedFileName,
  resolveAttachmentDir,
} from "@takenotes/core/attachments/import";
import { arrayBufferToBase64, closeWorkspaceFlow, followUnresolvedLinkFlow, linkMentionFlow, openWorkspaceFlow, refreshWorkspaceFlow, resolveWikilinkTarget } from "./workspace-flows";
import { paneDocs } from "./panes";
import { indexedEntryToQuickOpenItem } from "@takenotes/core/commands/palette";
import { FileTree } from "./components/tree";
import { FavoritesPane } from "./components/favorites";
import { OutlinePane, PreviewCard } from "./components/outline";
import { SidePanel } from "./components/side-panel";
import { ShortcutsDialog } from "./components/shortcuts-dialog";
import { aggregateTags } from "@takenotes/core/tags/tree";
import { lineForBlockId, lineForHeadingFragment, previewExcerpt } from "@takenotes/core/outline/extract";
import type { ParsedTakenotesUri } from "@takenotes/core/uri/parse";
import { renderMarkdown } from "@takenotes/core/markdown/render";
import { SearchPanel } from "./components/search";
import { ContextMenu, TabStrip } from "./components/overlays";
import { CommandMenu } from "./components/palette";
import { TemplatePicker } from "./components/template-picker";
import { ImportDialog } from "./components/import-dialog";
import { TaskDialog, type NewTaskInput } from "./components/task-dialog";
import { TodayPane } from "./components/today-pane";
import { CalendarPane } from "./components/calendar-pane";
import { TagsPane } from "./components/tags";
import { PropertiesPane } from "./components/properties-view";
import { CollectionsPane } from "./components/collections";
import { GraphPane } from "./components/graph";
import { CanvasEditor, isCanvasPath } from "./components/canvas";
import { loadPropertyRegistry } from "./index/property-registry";
import { renamePropertyKey } from "@takenotes/core/properties/summary";
import { collectTodayTasks } from "@takenotes/core/productivity/today";
import { dailyNotePath } from "@takenotes/core/productivity/daily";
import { templateDate } from "@takenotes/core/productivity/templates";
import { SettingsDialog } from "./components/settings";
import { WslDialog } from "./components/wsl-dialog";
import { UpdateDialog } from "./components/update-dialog";
import { HistoryDialog } from "./components/history-dialog";
import { buildFileMenu, buildTabMenu, type MenuOps } from "./components/menus";
import { Icon } from "./components/icons";
import { getBridge } from "./bridge";

/** Note-class files (imported as notes, never as attachments). */
const NOTE_FILE_RE = /\.(md|markdown|txt)$/i;

/** MIME subtype for fallback paste names (`image/png` → `png`). */
function mimeExt(mime: string): string {
  return (mime.split("/")[1]?.split(";")[0]?.split("+")[0] ?? "").replace(/[^a-z0-9]/gi, "");
}
import { isWslKind } from "@takenotes/platform/filesystem";
import { fileName, joinRel, parentDir, type CtxMenu } from "./components/types";
import { useSettingsStore } from "./stores/settings";
import { useIndexMeta } from "./stores/index-meta";
import { useNotify } from "./hooks/use-notify";
import { useRecents } from "./hooks/use-recents";
import { useWorkspace } from "./hooks/use-workspace";
import { useDocuments, type DocumentsApi } from "./hooks/use-documents";
import { useFileTree, type FileTreeApi } from "./hooks/use-file-tree";
import { useSearch, type SearchApi } from "./hooks/use-search";
import { useWslConnect } from "./hooks/use-wsl-connect";
import { useCollections } from "./hooks/use-collections";
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
/** "Edited 5 min ago" for the note meta line (prototype wording). */
function editedLabel(mtimeMs: number | undefined): string {
  if (!mtimeMs) return "Not edited yet";
  const diff = Date.now() - mtimeMs;
  const min = 60_000, hour = 60 * min, day = 24 * hour;
  if (diff < min) return "Edited just now";
  if (diff < hour) return `Edited ${Math.round(diff / min)} min ago`;
  if (diff < day) return `Edited ${Math.round(diff / hour)} h ago`;
  if (diff < 2 * day) return "Edited yesterday";
  return `Edited ${Math.round(diff / day)} days ago`;
}

/** Remembered panel visibility; anything unreadable falls back to the default. */
function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "true";
  } catch { return fallback; }
}

export default function App(): JSX.Element {
  const platform = usePlatform();
  const hotkeys = useHotkeys(platform.platform);
  const sc = (id: CommandId): string => hotkeys.labelFor(id) || platform.shortcutLabel(id);
  const notify = useNotify();
  const { toast } = notify;
  const settings = useSettingsStore((s) => s.settings);
  const setSettings = useSettingsStore((s) => s.setAll);
  const indexVersion = useIndexMeta((s) => s.version);
  const indexNotice = useIndexMeta((s) => s.notice);
  const bumpIndex = useIndexMeta((s) => s.bump);

  // Shell UI state: local, single-component, never leaves App.
  const [view, setViewRaw] = useState<SidebarView>("files");
  const [page, setPage] = useState<PageView | null>(null);
  // Today/Calendar/Tags/Properties/Collections/Graph open as pages in the
  // main column (prototype); files/search/outline/favorites stay sidebar views.
  const setView = useCallback((v: SidebarView): void => {
    if ((PAGE_VIEWS as readonly string[]).includes(v)) { setPage(v as PageView); return; }
    setPage(null);
    setViewRaw(v);
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(() => readFlag("takenotes.sidebarOpen", true));
  const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem("takenotes.sidebarWidth") ?? 256) || 256);
  // Per-pane collapse (Step 2 shell seam): one flag per left pane, persisted.
  const [paneCollapsed, setPaneCollapsed] = useState<Record<SidebarView, boolean>>(() => {
    try {
      return { files: false, search: false, outline: false, recent: false, favorites: false, today: false, calendar: false, ...JSON.parse(localStorage.getItem("takenotes.paneCollapsed") ?? "{}") };
    } catch {
      return { files: false, search: false, outline: false, recent: false, favorites: false, today: false, calendar: false };
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
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menu, setMenu] = useState<CtxMenu>(null);
  const [dirtyPrompt, setDirtyPrompt] = useState<null | { kind: "tab"; key: string; rel: string } | { kind: "entry"; entry: DirectoryEntry; dirty: { key: string; rel: string }[] }>(null);
  const dirtySaveRef = useRef<HTMLElement | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [rightOpen, setRightOpen] = useState(() => readFlag("takenotes.rightOpen", true));
  useEffect(() => {
    try { localStorage.setItem("takenotes.sidebarOpen", String(sidebarOpen)); localStorage.setItem("takenotes.rightOpen", String(rightOpen)); } catch { /* layout memory is a convenience */ }
  }, [sidebarOpen, rightOpen]);
  const [version, setVersion] = useState("0.0.1");
  // Local-date tick: refreshes the Today aggregate at next local midnight
  // so an app left open overnight doesn't show yesterday's tasks/Daily.
  const [todayKey, setTodayKey] = useState(() => templateDate(new Date()));
  useEffect(() => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 0, 50);
    const ms = Math.max(1000, next.getTime() - now.getTime());
    const t = setTimeout(() => setTodayKey(templateDate(new Date())), ms);
    return () => clearTimeout(t);
  }, [todayKey]);
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
  // Single close/delete prompt on dirty; bulk/quit/crash call closeTab directly (silent preserve).
  const requestCloseTab = useCallback((key: string) => {
    const doc = docsApi.layout.docs[key];
    if (doc && doc.dirty && !doc.loadError) setDirtyPrompt({ kind: "tab", key, rel: doc.relativePath });
    else docsApi.closeTab(key);
  }, [docsApi]);
  const requestRemoveEntry = useCallback((entry: DirectoryEntry) => {
    const ws = workspaceApi.workspace;
    if (!ws) return;
    const dirty = Object.values(docsApi.layout.docs)
      .filter((d) => d.dirty && !d.loadError && (d.relativePath === entry.relativePath || d.relativePath.startsWith(`${entry.relativePath}/`)))
      .map((d) => ({ key: d.key, rel: d.relativePath }));
    if (dirty.length === 0) void treeApi.removeEntry(entry);
    else setDirtyPrompt({ kind: "entry", entry, dirty });
  }, [docsApi, treeApi, workspaceApi]);
  const confirmDirtySave = useCallback(async () => {
    const p = dirtyPrompt;
    if (!p) return;
    if (p.kind === "tab") {
      await docsApi.save(p.key);
      setDirtyPrompt(null);
      docsApi.closeTab(p.key);
    } else {
      for (const d of p.dirty) await docsApi.save(d.key);
      setDirtyPrompt(null);
      void treeApi.removeEntry(p.entry);
    }
  }, [dirtyPrompt, docsApi, treeApi]);
  const confirmDirtyDiscard = useCallback(() => {
    const p = dirtyPrompt;
    if (!p) return;
    if (p.kind === "tab") {
      docsApi.discardDraft(p.key);
      docsApi.closeTabWithoutPreserve(p.key);
    } else {
      for (const d of p.dirty) docsApi.discardDraft(d.key);
      void treeApi.removeEntry(p.entry);
    }
    setDirtyPrompt(null);
  }, [dirtyPrompt, docsApi, treeApi]);
  const favoritesApi = useFavorites(workspace, notify);
  const collectionsApi = useCollections(workspace, notify);
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
  const [wsDialog, setWsDialog] = useState<null | { kind: "create" } | { kind: "server"; address: string } | { kind: "pair" }>(null);
  const [servers, setServers] = useState<RecentServer[]>(() => readRecentServers());
  const workspaceDialogs = (
    <>
      {workspaceApi.openError && (
        <ErrorDialog title={workspaceApi.openError.title} cause={workspaceApi.openError.cause} details={workspaceApi.openError.details}
          action={{ label: workspaceApi.openError.action, run: () => { workspaceApi.clearOpenError(); void workspaceApi.openLocal(); } }}
          onClose={workspaceApi.clearOpenError} />
      )}
      {wsDialog?.kind === "create" && (
        <CreateWorkspaceDialog existing={recents.recentWorkspaces.map((r) => ("displayName" in r ? r.displayName : r.name))}
          onClose={() => setWsDialog(null)}
          onCreate={async (name) => { const err = await workspaceApi.createWorkspace(name); if (!err) setWsDialog(null); return err; }} />
      )}
      {wsDialog?.kind === "server" && (
        <ServerSignInDialog initialAddress={wsDialog.address} onClose={() => setWsDialog(null)}
          onSignedIn={(address) => { setServers(rememberServer(address)); setWsDialog(null); notify.toast("Signed in. The server’s editor opened in your browser."); }} />
      )}
      {wsDialog?.kind === "pair" && (
        <PairDialog onClose={() => setWsDialog(null)} onPair={(server) => setWsDialog({ kind: "server", address: server })} />
      )}
    </>
  );
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
    setRightOpen,
    toggleFocusMode: () => setFocusMode((v) => !v),
    openSettings: () => setSettingsOpen(true),
    openPalette: (q) => setPalette({ initialQuery: q }),
    openPage: (p) => { setSettingsOpen(false); setPage(p); },
    openShortcuts: () => setShortcutsOpen(true),
    requestCloseTab,
    shortcutLabel: (id) => hotkeys.labelFor(id) || platform.shortcutLabel(id),
    addActiveToFavorites: () => {
      const tab = docsApi.activeTab;
      if (!tab) return;
      const group = favoritesApi.doc.groups[0]?.name ?? "default";
      void favoritesApi.addEntry(group, { type: "file", target: tab.relativePath });
    },
  });

  // Import dialog opens via the `file.import` command (palette dispatches
  // `takenotes:open-import-dialog`). Post-import convergence rebuilds the
  // tree + index so notes/attachments/backlinks/graph/search all see the
  // new files; per-file errors already surfaced in the dialog summary.
  const [importOpen, setImportOpen] = useState(false);
  useEffect(() => {
    const onOpen = (): void => {
      if (workspaceApi.workspace) setImportOpen(true);
    };
    window.addEventListener("takenotes:open-import-dialog", onOpen);
    return () => window.removeEventListener("takenotes:open-import-dialog", onOpen);
  }, [workspaceApi.workspace]);
  const convergeImport = useCallback(async () => {
    const ws = workspaceApi.workspace;
    const bridge = getBridge();
    if (!ws || !bridge) return;
    await treeApi.refresh(ws);
    await buildWorkspaceIndex(bridge, workspaceIndex, ws);
    bumpIndex();
  }, [workspaceApi.workspace, treeApi, bumpIndex]);

  // Template picker opens via the `template.insert` command (palette,
  // menu, or keyboard all dispatch `takenotes:open-template-picker`).
  useEffect(() => {
    const onOpen = (): void => {
      if (docsApi.activeTab) setTemplatePickerOpen(true);
    };
    window.addEventListener("takenotes:open-template-picker", onOpen);
    return () => window.removeEventListener("takenotes:open-template-picker", onOpen);
  }, [docsApi.activeTab]);

  const insertTemplate = useCallback(async (templateRel: string) => {
    const ws = workspaceApi.workspace;
    const active = docsApi.activeTab;
    const bridge = getBridge();
    if (!ws || !active || !bridge) return;
    setTemplatePickerOpen(false);
    const read = await bridge.file.read(ws.workspaceId, templateRel);
    if (!read.ok) { toast(`Couldn't read template "${templateRel}".`); return; }
    const { renderNoteTemplate, templateDate, templateTime, templateTitleForPath } = await import("@takenotes/core/productivity/templates");
    const now = new Date();
    const rendered = renderNoteTemplate(read.result.content, {
      title: templateTitleForPath(active.relativePath),
      date: templateDate(now),
      time: templateTime(now),
    });
    window.dispatchEvent(new CustomEvent("takenotes:insert-template-text", { detail: rendered }));
    commandsApi.remember("template.insert");
  }, [workspaceApi.workspace, docsApi.activeTab, toast, commandsApi]);

  // New-task dialog opens via the `task.new` command (palette, menu, or
  // keyboard all dispatch `takenotes:open-task-dialog`).
  useEffect(() => {
    const onOpen = (): void => {
      if (workspaceApi.workspace) setTaskDialogOpen(true);
    };
    window.addEventListener("takenotes:open-task-dialog", onOpen);
    return () => window.removeEventListener("takenotes:open-task-dialog", onOpen);
  }, [workspaceApi.workspace]);

  // Task capture (productivity step 2): append `- [ ] text @due(...)` to
  // today's Daily Note or Inbox.md per setting. The Daily Note is never
  // created silently — a missing one asks first. The append is a
  // read-then-write guarded by `expectedHash`, so a concurrent external
  // edit surfaces as CONFLICT instead of overwriting. No database: the
  // Markdown file stays authoritative and the index re-parses it.
  const captureTask = useCallback(async (input: NewTaskInput) => {
    const ws = workspaceApi.workspace;
    const bridge = getBridge();
    if (!ws || !bridge) return;
    setTaskDialogOpen(false);
    const { formatTaskLine, appendTaskLine, INBOX_RELATIVE_PATH } = await import("@takenotes/core/productivity/tasks");
    if (input.kind === "note") {
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ").replace(":", "");
      const target = resolveCreateTarget(`Capture ${stamp}`, treeApi.preferredNewNoteDir());
      if (!target.ok) { toast(target.error, "error"); return; }
      const created = await bridge.file.create(ws.workspaceId, target.rel);
      if (!created.ok) { toast(`Couldn't create ${target.rel}.`, "error"); return; }
      const body = `# Capture\n\n${input.text.replace(/\s+/g, " ").trim()}\n`;
      const wrote = await bridge.file.write({
        workspaceId: ws.workspaceId, relativePath: target.rel, content: body,
        expectedHash: created.result.hash, newlineStyle: "lf", hadBom: false,
      });
      if (!wrote.ok) { toast(`Couldn't save ${target.rel}.`, "error"); return; }
      workspaceIndex.upsert(ws.workspaceId, target.rel, body, wrote.result);
      bumpIndex();
      await refreshWorkspaceFlow({ tree: treeApi, search: searchApi }, ws);
      await docsApi.openFile(target.rel);
      toast(`Saved as ${target.rel}.`);
      return;
    }
    let line: string;
    try {
      line = input.kind === "bullet" ? `- ${input.text.replace(/\s+/g, " ").trim()}` : formatTaskLine(input.text, input.due);
      if (input.scheduled && input.kind !== "bullet") line += ` @scheduled(${input.scheduled})`;
      if (!line.replace(/^- (\[ \] )?/, "")) throw new Error("empty");
    } catch {
      toast("Couldn't save: invalid text or due date.", "error");
      return;
    }
    let rel = INBOX_RELATIVE_PATH;
    let base: { content: string; hash: string; newlineStyle: "lf" | "crlf"; hadBom: boolean } | null = null;
    let createdNew = false;
    if ((input.target ?? settings.taskCaptureTarget) === "daily") {
      const info = await bridge.daily.getToday(ws.workspaceId);
      if (!info.ok) { toast(`Couldn't find today's Daily Note.`, "error"); return; }
      rel = info.result.relativePath;
      if (!info.result.exists) {
        if (!window.confirm(`Today's Daily Note doesn't exist at ${rel}. Create it now?`)) return;
        const created = await bridge.daily.createToday(ws.workspaceId);
        if (!created.ok) { toast(`Couldn't create ${rel}.`, "error"); return; }
        base = { content: created.result.content, hash: created.result.revision.hash, newlineStyle: "lf", hadBom: false };
        createdNew = true;
        workspaceIndex.upsert(ws.workspaceId, rel, created.result.content, created.result.revision);
        bumpIndex();
      }
    }
    if (!base) {
      const read = await bridge.file.read(ws.workspaceId, rel);
      if (!read.ok) {
        if (read.error.code === "NOT_FOUND" && rel === INBOX_RELATIVE_PATH) {
          const created = await bridge.file.create(ws.workspaceId, rel);
          if (!created.ok) { toast(`Couldn't create ${rel}.`, "error"); return; }
          base = { content: "", hash: created.result.hash, newlineStyle: "lf", hadBom: false };
          createdNew = true;
        } else {
          toast(`Couldn't open ${rel}.`, "error");
          return;
        }
      } else {
        base = { content: read.result.content, hash: read.result.revision.hash, newlineStyle: read.result.newlineStyle, hadBom: read.result.hadBom };
      }
    }
    const next = appendTaskLine(base.content, line);
    const written = await bridge.file.write({
      workspaceId: ws.workspaceId, relativePath: rel, content: next,
      expectedHash: base.hash, newlineStyle: base.newlineStyle, hadBom: base.hadBom,
    });
    if (!written.ok) {
      if (written.error.code === "CONFLICT") toast(`${rel} changed on disk — task NOT appended. Try again.`, "error");
      else toast(`Couldn't append to ${rel}.`, "error");
      return;
    }
    workspaceIndex.upsert(ws.workspaceId, rel, next, written.result);
    bumpIndex();
    if (createdNew) { void treeApi.refresh(ws); void treeApi.rebuild(ws); }
    void docsApi.reconcileExternalChange(rel);
    commandsApi.remember("task.new");
    toast(input.kind === "bullet" ? `Captured to ${rel}.` : `Task added to ${rel}.`);
  }, [workspaceApi.workspace, settings.taskCaptureTarget, toast, commandsApi, bumpIndex, treeApi, docsApi, searchApi]);

  // Calendar drag (productivity step 4): dropping a task on a day rewrites
  // only its `@scheduled` token — never `@due`, never anything else. The
  // write rides the same `expectedHash` guard as saves and capture, so a
  // concurrent edit surfaces as CONFLICT instead of overwriting. The line
  // is re-read fresh (1-based) and must still be a checkbox; stale drops
  // bail out with a toast instead of touching the file.
  const rescheduleTask = useCallback(async (relativePath: string, line: number, targetDate: string) => {
    const ws = workspaceApi.workspace;
    const bridge = getBridge();
    if (!ws || !bridge) return;
    const { rewriteScheduledToken } = await import("@takenotes/core/productivity/calendar");
    const read = await bridge.file.read(ws.workspaceId, relativePath);
    if (!read.ok) { toast(`Couldn't open ${relativePath}.`, "error"); return; }
    const newline = read.result.content.includes("\r\n") ? "\r\n" : "\n";
    const lines = read.result.content.split(newline);
    const current = lines[line - 1];
    if (current === undefined || !/^\s*(?:>\s*)*([-*+]|\d+[.)])\s+\[[ xX]\]/.test(current)) {
      toast("That task moved — refresh and try again.", "error");
      return;
    }
    let nextLine: string;
    try {
      nextLine = rewriteScheduledToken(current, targetDate);
    } catch {
      toast("Couldn't move the task: invalid date.", "error");
      return;
    }
    if (nextLine === current) return;
    lines[line - 1] = nextLine;
    const next = lines.join(newline);
    const written = await bridge.file.write({
      workspaceId: ws.workspaceId, relativePath, content: next,
      expectedHash: read.result.revision.hash, newlineStyle: read.result.newlineStyle, hadBom: read.result.hadBom,
    });
    if (!written.ok) {
      if (written.error.code === "CONFLICT") toast(`${relativePath} changed on disk — drop NOT applied. Try again.`, "error");
      else toast(`Couldn't move the task.`, "error");
      return;
    }
    workspaceIndex.upsert(ws.workspaceId, relativePath, next, written.result);
    bumpIndex();
    void docsApi.reconcileExternalChange(relativePath);
  }, [workspaceApi.workspace, toast, bumpIndex, docsApi]);

  // Timeline drops (Today page): set `@scheduled` to an hour today, or clear
  // it. Same guarded write as reschedule/toggle: fresh read, checkbox-line
  // check, expectedHash, so a concurrent edit surfaces instead of clobbering.
  const scheduleTaskAt = useCallback(async (relativePath: string, line: number, hour: number | null) => {
    const ws = workspaceApi.workspace;
    const bridge = getBridge();
    if (!ws || !bridge) return;
    const { rewriteScheduledHour, removeScheduledToken } = await import("@takenotes/core/productivity/calendar");
    const read = await bridge.file.read(ws.workspaceId, relativePath);
    if (!read.ok) { toast(`Couldn't open ${relativePath}.`, "error"); return; }
    const newline = read.result.content.includes("\r\n") ? "\r\n" : "\n";
    const lines = read.result.content.split(newline);
    const current = lines[line - 1];
    if (current === undefined || !/^\s*(?:>\s*)*([-*+]|\d+[.)])\s+\[[ xX]\]/.test(current)) {
      toast("That task moved — refresh and try again.", "error");
      return;
    }
    let nextLine: string;
    try {
      nextLine = hour === null ? removeScheduledToken(current) : rewriteScheduledHour(current, todayKey, hour);
    } catch {
      toast("Couldn't schedule the task.", "error");
      return;
    }
    if (nextLine === current) return;
    lines[line - 1] = nextLine;
    const next = lines.join(newline);
    const written = await bridge.file.write({
      workspaceId: ws.workspaceId, relativePath, content: next,
      expectedHash: read.result.revision.hash, newlineStyle: read.result.newlineStyle, hadBom: read.result.hadBom,
    });
    if (!written.ok) {
      toast(written.error.code === "CONFLICT" ? `${relativePath} changed on disk — nothing was changed. Try again.` : "Couldn't schedule the task.", "error");
      return;
    }
    workspaceIndex.upsert(ws.workspaceId, relativePath, next, written.result);
    bumpIndex();
    void docsApi.reconcileExternalChange(relativePath);
    toast(hour === null ? "Unscheduled. @due is unchanged." : `Scheduled for ${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? "PM" : "AM"}. @due is unchanged.`);
  }, [workspaceApi.workspace, todayKey, toast, bumpIndex, docsApi]);

  const toggleTask = useCallback(async (relativePath: string, line: number) => {
    const ws = workspaceApi.workspace;
    const bridge = getBridge();
    if (!ws || !bridge) return;
    const read = await bridge.file.read(ws.workspaceId, relativePath);
    if (!read.ok) { toast(`Couldn't open ${relativePath}.`, "error"); return; }
    const newline = read.result.content.includes("\r\n") ? "\r\n" : "\n";
    const lines = read.result.content.split(newline);
    const current = lines[line - 1];
    const box = current === undefined ? null : /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/.exec(current);
    if (current === undefined || !box) { toast("That task moved — refresh and try again.", "error"); return; }
    lines[line - 1] = current.replace(/\[[ xX]\]/, box[2] === " " ? "[x]" : "[ ]");
    const next = lines.join(newline);
    const written = await bridge.file.write({
      workspaceId: ws.workspaceId, relativePath, content: next,
      expectedHash: read.result.revision.hash, newlineStyle: read.result.newlineStyle, hadBom: read.result.hadBom,
    });
    if (!written.ok) {
      toast(written.error.code === "CONFLICT" ? `${relativePath} changed on disk — nothing was changed. Try again.` : "Couldn't update the task.", "error");
      return;
    }
    workspaceIndex.upsert(ws.workspaceId, relativePath, next, written.result);
    bumpIndex();
    void docsApi.reconcileExternalChange(relativePath);
  }, [workspaceApi.workspace, toast, bumpIndex, docsApi]);

  useGlobalKeyboard({
    paletteOpen: palette !== null || templatePickerOpen || taskDialogOpen,
    platform,
    tree: treeApi,
    docs: docsApi,
    executeCommand: commandsApi.executeCommand,
    hotkeyOverrides: hotkeys.overrides,
  });

  // Step 9 appearance application: one effect owns every DOM write from
  // settings (theme + accent + editor face + zoom + window title), so a
  // switch never remounts editors or disturbs cursor/scroll/undo —
  // CodeMirror reads the same `--accent` / `--font-editor` variables.
  const activeTabPath = docsApi.activeTab?.relativePath;
  const workspaceName = workspace?.displayName;
  useEffect(() => {
    localStorage.setItem("takenotes.settings", JSON.stringify(settings));
    const theme: AppearanceTheme = resolveTheme(settings.theme, window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.accent = settings.accent;
    const root = document.documentElement.style;
    const vars = appearanceVars({
      editorFont: settings.editorFont,
      fontSize: settings.fontSize,
      lineHeight: settings.lineHeight,
      readableWidth: settings.readableWidth,
    });
    for (const [key, value] of Object.entries(vars)) root.setProperty(key, value);
    // Whole-app zoom via CSS (persisted in settings, works offline and in
    // browser mode). Native menu zoom roles compound on top of this — a
    // known wart unified in slice 6c (single zoom path).
    root.setProperty("zoom", String(clampZoom(settings.zoomLevel)));
    // Tab title bar: the OS window/taskbar names the active note, falling
    // back to the workspace and then the app name. Never a file path.
    document.title = activeTabPath
      ? `takenotes — ${fileName(activeTabPath)}`
      : workspaceName ? `takenotes — ${workspaceName}` : "takenotes";
    localStorage.setItem("takenotes.sidebarWidth", String(sidebarWidth));
  }, [settings, sidebarWidth, activeTabPath, workspaceName]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (): void => {
      if (settings.theme !== "system") return;
      // System flip only re-resolves the theme attribute — accent pairs
      // are theme-keyed in CSS (`[data-theme="dark"][data-accent]`).
      document.documentElement.dataset.theme = mq.matches ? "dark" : "light";
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [settings]);

  // Zoom quick-adjust (`app.zoomIn/Out/Reset` from palette or keyboard):
  // single path into settings so the factor persists and the effect above
  // applies it. Reads fresh state so stale closures never lose a step.
  useEffect(() => {
    const adjust = (direction: "in" | "out" | "reset"): void => {
      const current = useSettingsStore.getState().settings;
      const zoomLevel = direction === "reset" ? 1 : stepZoom(current.zoomLevel, direction);
      if (zoomLevel !== current.zoomLevel) setSettings({ ...current, zoomLevel });
    };
    const onIn = (): void => adjust("in");
    const onOut = (): void => adjust("out");
    const onReset = (): void => adjust("reset");
    window.addEventListener("takenotes:zoom-in", onIn);
    window.addEventListener("takenotes:zoom-out", onOut);
    window.addEventListener("takenotes:zoom-reset", onReset);
    return () => {
      window.removeEventListener("takenotes:zoom-in", onIn);
      window.removeEventListener("takenotes:zoom-out", onOut);
      window.removeEventListener("takenotes:zoom-reset", onReset);
    };
  }, [setSettings]);

  // Step 9 frame preference: main reads the stored value before the
  // renderer exists, so mirror the setting into the profile file (the
  // sole writer). Idempotent — also heals a missing file on launch.
  // Silent on failure: the window still opens with the default frame.
  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;
    void bridge.app.setFrameStyle(settings.frameStyle).catch(() => undefined);
  }, [settings.frameStyle]);

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
    removeEntry: (entry) => requestRemoveEntry(entry),
    trashEntry: (entry) => requestRemoveEntry(entry),
    beginCreate: (dir, folder) => folder ? treeApi.beginCreate(dir, true) : void treeApi.createUntitledNote(dir),
    select: (rel) => treeApi.select(rel),
    closeTab: (key) => requestCloseTab(key),
    closeTabSilent: (key) => docsApi.closeTab(key),
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
  }), [requestCloseTab, requestRemoveEntry, treeApi, commandsApi.executeCommand, workspaceApi, refreshWorkspace, favoritesApi]);

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

  // Today pane (productivity step 3): overdue + due-today + scheduled-today
  // derived from the document index, memoised on the index version so every
  // mutation (typing, capture, drag) refreshes it. No database anywhere.
  // Daily-note existence + recent files ride the same memo (ADR-0011
  // aggregate: tasks, Daily state, recents — recents refresh as files open).
  // todayKey ticks at local midnight so the pane rolls over without reload.
  const todayGroups = useMemo(() => {
    if (!workspace) return null;
    try {
      const today = todayKey;
      const entries = workspaceIndex.list(workspace.workspaceId);
      const known = new Set(entries.map((e) => e.relativePath));
      const dailyPath = dailyNotePath(today);
      return {
        today,
        groups: collectTodayTasks(entries, today),
        daily: { relativePath: dailyPath, exists: known.has(dailyPath) },
        recents: recents.recents.filter((r) => known.has(r)).slice(0, 5),
      };
    } catch {
      return null;
    }
  }, [workspace?.workspaceId, indexVersion, recents.recents, todayKey]);

  // Right-sidebar link panes (Step 4): derived from the typed edge table +
  // entries, memoised on the index version so every mutation refreshes them.
  const linkGraph = useMemo(() => {
    if (!workspace) return null;
    return { edges: workspaceIndex.edges(workspace.workspaceId), entries: workspaceIndex.list(workspace.workspaceId) };
  }, [workspace?.workspaceId, indexVersion]);

  // Phase 3 panes (Step 6): tags / properties / collections read the same
  // parse-once index, memoised on the index version like every other pane.
  const phase3Entries = useMemo(
    () => (workspace ? workspaceIndex.list(workspace.workspaceId) : null),
    [workspace?.workspaceId, indexVersion],
  );
  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of treeApi.allFiles) {
      if (f.fileClass !== "markdown") continue;
      const parts = f.relativePath.split("/");
      for (let i = 1; i < parts.length; i++) {
        const dir = parts.slice(0, i).join("/");
        counts.set(dir, (counts.get(dir) ?? 0) + 1);
      }
    }
    return counts;
  }, [treeApi.allFiles]);
  const [pendingUpdate, setPendingUpdate] = useState<string | null>(null);
  useEffect(() => {
    const d = updatesApi.dialog;
    if (d?.phase === "available" && d.latest) setPendingUpdate(d.latest);
  }, [updatesApi.dialog]);
  const activeDocKey = docsApi.layout.activeKey;
  useEffect(() => { setPage(null); setSettingsOpen(false); }, [activeDocKey]);
  const activeIndexEntry = useMemo(() => {
    const rel = docsApi.activeTab?.relativePath;
    if (!workspace || !rel) return null;
    return workspaceIndex.get(workspace.workspaceId, rel) ?? null;
  }, [workspace?.workspaceId, docsApi.activeTab?.relativePath, indexVersion]);
  const propertyRegistry = useMemo(
    () => (workspace ? loadPropertyRegistry(undefined, workspace.workspaceId) : {}),
    [workspace?.workspaceId],
  );
  const runSearchQuery = useCallback((query: string) => {
    setView("search");
    setSidebarOpen(true);
    searchApi.setQuery(query);
  }, [searchApi]);

  // Phase 3 global property rename: every note carrying `oldName` gets a
  // YAML-preserving key move (refuse-to-clobber per file), written against
  // its read revision so CONFLICT — never silent overwrite — on races.
  // Open tabs converge via the Step 0 reconcile contract.
  const [renamingProp, setRenamingProp] = useState(false);
  const renamePropertyEverywhere = useCallback(async (oldName: string, newName: string) => {
    const ws = workspaceApi.workspace;
    const bridge = getBridge();
    if (!ws || !bridge) { toast("Desktop bridge unavailable — open via the Electron app.", "error"); return; }
    setRenamingProp(true);
    try {
      let renamed = 0;
      let skipped = 0;
      for (const e of workspaceIndex.list(ws.workspaceId)) {
        const fm = e.frontmatter;
        if (!fm || typeof fm !== "object" || !(oldName in (fm as Record<string, unknown>))) continue;
        const read = await bridge.file.read(ws.workspaceId, e.relativePath);
        if (!read.ok) { skipped++; continue; }
        const patched = renamePropertyKey(read.result.content, oldName, newName);
        if ("error" in patched) { skipped++; continue; }
        if (patched.content === read.result.content) continue;
        const written = await bridge.file.write({
          workspaceId: ws.workspaceId,
          relativePath: e.relativePath,
          content: patched.content,
          expectedHash: read.result.revision.hash,
          newlineStyle: read.result.newlineStyle,
          hadBom: read.result.hadBom,
        });
        if (!written.ok) { skipped++; continue; }
        workspaceIndex.upsert(ws.workspaceId, e.relativePath, patched.content, written.result);
        await docsApi.reconcileExternalChange(e.relativePath);
        renamed++;
      }
      bumpIndex();
      toast(skipped > 0
        ? `Renamed ${oldName} → ${newName} in ${renamed} note${renamed === 1 ? "" : "s"} (${skipped} skipped).`
        : `Renamed ${oldName} → ${newName} in ${renamed} note${renamed === 1 ? "" : "s"}.`);
    } finally {
      setRenamingProp(false);
    }
  }, [workspaceApi.workspace, docsApi, toast, bumpIndex]);
  const openLinkTarget = useCallback((rel: string) => {
    void docsApi.openFile(rel).then(() => void treeApi.reveal(rel));
  }, [docsApi, treeApi]);

  // Step 4 follow-to-create: a link to a nonexistent note resolves its
  // creation path from the link text → creates → opens → reveals, with
  // tree/index converging after. Failures toast honestly; success is silent.
  const followLink = useCallback(async (rawTarget: string, fromPath: string) => {
    const ws = workspaceApi.workspace;
    const bridge = getBridge();
    if (!ws || !bridge) { toast("Desktop bridge unavailable — open via the Electron app.", "error"); return; }
    const result = await followUnresolvedLinkFlow({
      listFiles: () => treeApi.allFiles.map((f) => f.relativePath),
      createFile: (rel) => bridge.file.create(ws.workspaceId, rel),
      writeFile: (rel, content, expectedHash) =>
        bridge.file.write({ workspaceId: ws.workspaceId, relativePath: rel, content, expectedHash, newlineStyle: "lf", hadBom: false }),
      upsertIndex: (rel, content, revision) => syncFileIndex(workspaceIndex, ws.workspaceId, rel, content, revision),
      openFile: (rel) => docsApi.openFile(rel),
      reveal: (rel) => treeApi.reveal(rel),
      refresh: async () => {
        bumpIndex();
        await refreshWorkspaceFlow({ tree: treeApi, search: searchApi }, ws);
      },
    }, rawTarget, fromPath);
    if (result.status === "invalid") toast(`Can't create a note from "${rawTarget}".`, "error");
    else if (result.status === "failed") toast(`Couldn't create ${result.rel}.`, "error");
  }, [workspaceApi.workspace, treeApi, docsApi, searchApi, toast, bumpIndex]);

  // Step 8 URI actions (`takenotes://open/new/daily/search`): external
  // entry points onto the open workspace. Guardrails (main/uri/handler):
  // no workspace → notice, never auto-open; `open` never creates
  // (openFile toasts honestly on missing files); `daily` skips the
  // in-app create confirm because the URI caller cannot click it — the
  // fixed Daily path plus the ordinary revision-tracked pipeline are the
  // guardrails. `x-success`/`x-error` are opaque echoes, never opened.
  const handleUriAction = useCallback(async (delivery: { ok: boolean; raw: string; payload: unknown }) => {
    const ws = workspaceApi.workspace;
    const bridge = getBridge();
    if (!ws || !bridge) { toast("Link ignored — open a workspace first.", "error"); return; }
    if (!delivery.ok) {
      const message = (delivery.payload as { message?: string } | null)?.message ?? "Malformed link.";
      toast(`Couldn't handle link: ${message}`, "error");
      return;
    }
    const uri = delivery.payload as ParsedTakenotesUri;
    const failEcho = uri.errorEcho ? ` (${uri.errorEcho})` : "";
    if (uri.action.action === "open") {
      const { path, heading, block } = uri.action;
      if (!path) { toast("Open needs a file path.", "error"); return; }
      await docsApi.openFile(path);
      await treeApi.reveal(path);
      if (heading ?? block) {
        const tab = docsRef.current?.activeTab ?? null;
        const content = tab && tab.relativePath === path && !tab.loadError ? tab.content : null;
        const line = content
          ? (heading ? lineForHeadingFragment(content, heading) : lineForBlockId(content, block ?? ""))
          : null;
        if (line) gotoLine(line);
        else toast(`Opened ${path}, but the heading/block wasn't found.${failEcho}`, "error");
      }
      return;
    }
    if (uri.action.action === "search") { runSearchQuery(uri.action.query); return; }
    if (uri.action.action === "daily") {
      const info = await bridge.daily.getToday(ws.workspaceId);
      if (!info.ok) { toast(`Couldn't open today's note: ${info.error.message}${failEcho}`, "error"); return; }
      if (info.result.exists) {
        await docsApi.openFile(info.result.relativePath);
        await treeApi.reveal(info.result.relativePath);
        return;
      }
      const created = await bridge.daily.createToday(ws.workspaceId);
      if (!created.ok) { toast(`Couldn't create today's note: ${created.error.message}${failEcho}`, "error"); return; }
      workspaceIndex.upsert(ws.workspaceId, created.result.relativePath, created.result.content, created.result.revision);
      bumpIndex();
      await treeApi.refresh(ws);
      await treeApi.rebuild(ws);
      await docsApi.openFile(created.result.relativePath);
      return;
    }
    // `new`: explicit path wins; otherwise the name resolves exactly like
    // a `[[link]]` (creation-path-from-link honored); bare `new` mints an
    // untitled note. Content is written only to files this action created —
    // an existing file opens untouched and says so.
    const content = uri.action.content ?? "";
    const openCreated = async (rel: string): Promise<void> => {
      if (content) {
        const read = await bridge.file.read(ws.workspaceId, rel);
        if (read.ok) {
          const written = await bridge.file.write({
            workspaceId: ws.workspaceId, relativePath: rel, content,
            expectedHash: read.result.revision.hash,
            newlineStyle: read.result.newlineStyle, hadBom: read.result.hadBom,
          });
          if (written.ok) {
            syncFileIndex(workspaceIndex, ws.workspaceId, rel, content, written.result);
            bumpIndex();
          }
        }
      }
      await refreshWorkspaceFlow({ tree: treeApi, search: searchApi }, ws);
      await docsApi.openFile(rel);
      await treeApi.reveal(rel);
    };
    if (uri.action.path) {
      const created = await bridge.file.create(ws.workspaceId, uri.action.path);
      if (!created.ok) {
        if (created.error.code === "ALREADY_EXISTS") {
          await docsApi.openFile(uri.action.path);
          await treeApi.reveal(uri.action.path);
          if (content) toast(`${uri.action.path} already exists — content not written.`, "error");
        } else {
          toast(`Couldn't create ${uri.action.path}: ${created.error.message}${failEcho}`, "error");
        }
        return;
      }
      await openCreated(uri.action.path);
      return;
    }
    if (uri.action.name) {
      await followLink(uri.action.name, "");
      if (content) {
        const tab = docsRef.current?.activeTab ?? null;
        if (tab && !tab.loadError) {
          const written = await bridge.file.write({
            workspaceId: ws.workspaceId, relativePath: tab.relativePath, content,
            expectedHash: tab.revisionHash, newlineStyle: tab.newlineStyle, hadBom: tab.hadBom,
          });
          if (written.ok) {
            syncFileIndex(workspaceIndex, ws.workspaceId, tab.relativePath, content, written.result);
            bumpIndex();
            await docsApi.reconcileExternalChange(tab.relativePath);
          }
        }
      }
      return;
    }
    await treeApi.createUntitledNote();
    if (content) {
      const tab = docsRef.current?.activeTab ?? null;
      if (tab && !tab.loadError) {
        const written = await bridge.file.write({
          workspaceId: ws.workspaceId, relativePath: tab.relativePath, content,
          expectedHash: tab.revisionHash, newlineStyle: tab.newlineStyle, hadBom: tab.hadBom,
        });
        if (written.ok) {
          syncFileIndex(workspaceIndex, ws.workspaceId, tab.relativePath, content, written.result);
          bumpIndex();
          await docsApi.reconcileExternalChange(tab.relativePath);
        }
      }
    }
  }, [workspaceApi.workspace, treeApi, docsApi, searchApi, workspaceIndex, runSearchQuery, followLink, gotoLine, bumpIndex, toast]);

  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;
    return bridge.events.onUriAction((delivery) => { void handleUriAction(delivery); });
  }, [handleUriAction]);

  // Step 4 alias action: convert an unlinked mention into `[[Canon|Alias]]
  // (Markdown form when wikilinks are off). One occurrence per tap; open
  // tabs converge via the Step 0 reload-or-CONFLICT contract. Success is
  // silent — the panes rebuild from the refreshed index.
  const linkMention = useCallback(async (from: string, matchedText: string, target: string) => {
    const ws = workspaceApi.workspace;
    const bridge = getBridge();
    if (!ws || !bridge) { toast("Desktop bridge unavailable — open via the Electron app.", "error"); return; }
    // Remember the text before and the revision after, so the toast can offer a real Undo.
    let before: { content: string; newlineStyle: "lf" | "crlf"; hadBom: boolean } | null = null;
    let afterHash = "";
    const result = await linkMentionFlow({
      readFile: async (rel) => {
        const r = await bridge.file.read(ws.workspaceId, rel);
        if (r.ok) before = { content: r.result.content, newlineStyle: r.result.newlineStyle, hadBom: r.result.hadBom };
        return r;
      },
      writeFile: async ({ rel, content, expectedHash, newlineStyle, hadBom }) => {
        const w = await bridge.file.write({ workspaceId: ws.workspaceId, relativePath: rel, content, expectedHash, newlineStyle, hadBom });
        if (w.ok) afterHash = w.result.hash;
        return w;
      },
      upsertIndex: (rel, content, revision) => syncFileIndex(workspaceIndex, ws.workspaceId, rel, content, revision),
      reconcile: (rel) => docsApi.reconcileExternalChange(rel),
      refresh: async () => {
        bumpIndex();
        await refreshWorkspaceFlow({ tree: treeApi, search: searchApi }, ws);
      },
      linkFormat: () => settings.linkFormat,
      useWikilinks: () => settings.useWikilinks,
    }, from, matchedText, target);
    if (result.status === "conflict") toast(`${result.rel} changed on disk — mention NOT linked. Try again.`, "error");
    else if (result.status === "not-found") toast(`Mention no longer found in ${result.rel}.`, "error");
    else if (result.status === "failed") toast(`Couldn't link the mention in ${result.rel}.`, "error");
    else if (result.status === "linked" && before) {
      const old = before as { content: string; newlineStyle: "lf" | "crlf"; hadBom: boolean };
      toast(`Linked “${matchedText}” in ${fileName(from).replace(/\.md$/i, "")}.`, "info", {
        label: "Undo",
        run: () => {
          void (async () => {
            const w = await bridge.file.write({ workspaceId: ws.workspaceId, relativePath: from, content: old.content, expectedHash: afterHash, newlineStyle: old.newlineStyle, hadBom: old.hadBom });
            if (!w.ok) { toast(`${fileName(from)} changed since, so the link was left in place.`, "error"); return; }
            syncFileIndex(workspaceIndex, ws.workspaceId, from, old.content, w.result);
            await docsApi.reconcileExternalChange(from);
            bumpIndex();
          })();
        },
      });
    }
  }, [workspaceApi.workspace, treeApi, docsApi, searchApi, settings.linkFormat, settings.useWikilinks, toast, bumpIndex]);

  // Note-file import (Step 2 copy-in, shared by sidebar and editor drops):
  // markdown/text files land in `dir` with `name 1.md` collision
  // increment, never overwritten or moved. Returns created rels so editor
  // drops can link them; sidebar drops ignore the return.
  const importNoteFiles = useCallback(async (files: File[], dir: string): Promise<string[]> => {
    const ws = workspaceApi.workspace;
    const bridge = getBridge();
    if (!ws || !bridge) { toast("Desktop bridge unavailable — open via the Electron app.", "error"); return []; }
    const existing = new Set(treeApi.allFiles.map((f) => f.relativePath.toLowerCase()));
    const created: string[] = [];
    let imported = 0;
    for (const file of Array.from(files)) {
      const prefix = dir ? `${dir}/`.toLowerCase() : "";
      const siblings = new Set(
        [...existing]
          .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"))
          .map((p) => p.slice(prefix.length)),
      );
      const name = uniqueCopyName(file.name.replace(/\.[^.]+$/, ".md"), siblings);
      const rel = dir ? `${dir}/${name}` : name;
      const made = await bridge.file.create(ws.workspaceId, rel);
      if (!made.ok) { toast(`Couldn't import "${file.name}".`); continue; }
      const content = await file.text();
      const written = await bridge.file.write({ workspaceId: ws.workspaceId, relativePath: rel, content, expectedHash: made.result.hash, newlineStyle: "lf", hadBom: false });
      if (!written.ok) { toast(`Couldn't import "${file.name}".`); continue; }
      workspaceIndex.upsert(ws.workspaceId, rel, content, written.result);
      existing.add(rel.toLowerCase());
      created.push(rel);
      imported++;
    }
    if (imported > 0) {
      bumpIndex();
      await refreshWorkspaceFlow({ tree: treeApi, search: searchApi }, ws);
    }
    return created;
  }, [workspaceApi.workspace, treeApi, searchApi, toast, bumpIndex]);

  // Attachment import (Step 4): pasted/dropped files land per the
  // attachment location setting with `name 1.ext` collision increment.
  // Binaries never touch the document index (tree refresh only — the
  // index build skips non-note classes). Returns insertion texts for
  // editor drops/pastes; sidebar drops ignore them.
  const importAttachmentFiles = useCallback(async (files: File[], notePath: string): Promise<string[]> => {
    const ws = workspaceApi.workspace;
    const bridge = getBridge();
    if (!ws || !bridge) { toast("Desktop bridge unavailable — open via the Electron app.", "error"); return []; }
    const links: string[] = [];
    const existing = new Set(treeApi.allFiles.map((f) => f.relativePath.toLowerCase()));
    let imported = 0;
    let skipped = 0;
    for (const file of Array.from(files)) {
      // Unnamed clipboard items (screenshots) fall back to timestamped names.
      const rawName = file.name || pastedFileName(mimeExt(file.type));
      // A dropped name can never escape: basename only, main validates.
      const base = rawName.replace(/\\/g, "/").split("/").pop()?.trim() || pastedFileName(mimeExt(file.type));
      const kind = classifyAttachment(base);
      if (kind === "unsupported" && settings.attachmentUnsupported === "skip") { skipped++; continue; }
      const dir = resolveAttachmentDir(settings.attachmentLocation, settings.attachmentFolder, notePath);
      if (dir === null) { toast(`Attachment folder "${settings.attachmentFolder}" is not a valid path.`, "error"); continue; }
      const prefix = dir ? `${dir}/`.toLowerCase() : "";
      const siblingsOf = (): Set<string> => new Set(
        [...existing]
          .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"))
          .map((p) => p.slice(prefix.length)),
      );
      let bytes: ArrayBuffer;
      try {
        bytes = await file.arrayBuffer();
      } catch {
        toast(`Couldn't read "${base}".`, "error");
        continue;
      }
      if (bytes.byteLength === 0) { toast(`"${base}" is empty — skipped.`, "error"); continue; }
      const base64 = arrayBufferToBase64(bytes);
      // No-clobber retry: a raced name picks the next `name 1.ext`.
      const sib = siblingsOf();
      let name = attachmentFileName(base, sib);
      let rel = dir ? `${dir}/${name}` : name;
      let res = await bridge.file.importBinary({ workspaceId: ws.workspaceId, relativePath: rel, base64 });
      for (let attempt = 0; attempt < 3 && !res.ok && res.error.code === "ALREADY_EXISTS"; attempt++) {
        sib.add(name.toLowerCase());
        existing.add(rel.toLowerCase());
        name = attachmentFileName(base, sib);
        rel = dir ? `${dir}/${name}` : name;
        res = await bridge.file.importBinary({ workspaceId: ws.workspaceId, relativePath: rel, base64 });
      }
      if (!res.ok) {
        toast(res.error.code === "TOO_LARGE" ? `"${base}" is too large to import (over 100 MiB).` : `Couldn't import "${base}".`, "error");
        continue;
      }
      existing.add(rel.toLowerCase());
      imported++;
      const link = buildAttachmentLink(rel, notePath, settings.linkFormat, settings.useWikilinks, kind, settings.attachmentUnsupported);
      if (link) links.push(link);
    }
    if (imported > 0) {
      bumpIndex();
      await refreshWorkspaceFlow({ tree: treeApi, search: searchApi }, ws);
    }
    if (skipped > 0) toast(`Skipped ${skipped} unsupported file${skipped === 1 ? "" : "s"}.`, "error");
    return links;
  }, [workspaceApi.workspace, treeApi, searchApi, settings.attachmentLocation, settings.attachmentFolder, settings.attachmentUnsupported, settings.linkFormat, settings.useWikilinks, toast, bumpIndex]);

  // Editor drop/paste: note files import + link at the cursor; everything
  // else imports per the attachment policy + embeds at the cursor.
  // (The cursor usually sits at the drop point — mousedown precedes drop.)
  const importEditorFiles = useCallback(async (files: File[], notePath: string) => {
    const dir = treeApi.preferredNewNoteDir();
    const notes = files.filter((f) => NOTE_FILE_RE.test(f.name));
    const rest = files.filter((f) => !NOTE_FILE_RE.test(f.name));
    if (notes.length > 0) {
      const rels = await importNoteFiles(notes, dir);
      // Raw rels: the insert-link handler wraps `[[…]]` itself (same as
      // internal tree drags, extension included).
      for (const rel of rels) {
        window.dispatchEvent(new CustomEvent("takenotes:insert-link", { detail: rel }));
      }
    }
    if (rest.length > 0) {
      const links = await importAttachmentFiles(rest, notePath);
      if (links.length > 0) {
        window.dispatchEvent(new CustomEvent("takenotes:insert-attachment-text", { detail: links.join("\n") }));
      }
    }
  }, [importNoteFiles, importAttachmentFiles, treeApi]);

  /* ---------- note page: "..." menu, details, plain text, focus mode ---------- */
  const [plainDocs, setPlainDocs] = useState<ReadonlySet<string>>(new Set());
  const [fileDetails, setFileDetails] = useState<string | null>(null);

  const makeCopy = useCallback(async (key: string) => {
    const ws = workspaceApi.workspace;
    const doc = docsApi.layout.docs[key];
    const bridge = getBridge();
    if (!ws || !doc || !bridge) return;
    const dir = parentDir(doc.relativePath);
    const base = fileName(doc.relativePath).replace(/\.md$/i, "");
    const taken = new Set(treeApi.allFiles.map((f) => f.relativePath.toLowerCase()));
    let n = 1;
    let target = joinRel(dir, `${base} copy.md`);
    while (taken.has(target.toLowerCase())) target = joinRel(dir, `${base} copy ${++n}.md`);
    const created = await bridge.file.create(ws.workspaceId, target);
    if (!created.ok) { notify.errToast(created.error, "Couldn't make a copy"); return; }
    const written = await bridge.file.write({ workspaceId: ws.workspaceId, relativePath: target, content: doc.content, expectedHash: created.result.hash, newlineStyle: doc.newlineStyle, hadBom: doc.hadBom });
    if (!written.ok) { notify.errToast(written.error, "Couldn't make a copy"); return; }
    await refreshWorkspaceFlow({ tree: treeApi, search: searchApi }, ws);
    await docsApi.openFile(target);
  }, [workspaceApi.workspace, docsApi, treeApi, searchApi, notify]);

  const showNoteMenu = useCallback((key: string, e: React.MouseEvent) => {
    e.preventDefault();
    const doc = docsApi.layout.docs[key];
    if (!doc) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const plain = plainDocs.has(key);
    const entry = treeApi.allFiles.find((f) => f.relativePath === doc.relativePath);
    const ws = workspaceApi.workspace;
    setMenu({
      x: r.right - 200, y: r.bottom + 4,
      items: [
        { label: "Find in note", shortcut: sc("editor.find"), run: () => window.dispatchEvent(new Event("takenotes:editor-find")) },
        { label: "Show file details", run: () => setFileDetails(key) },
        { label: "Rename", shortcut: "F2", run: () => { const i = document.querySelector<HTMLInputElement>(".note-title-input"); i?.focus(); i?.select(); } },
        { label: "Make a copy", run: () => void makeCopy(key) },
        { label: "Insert from a template…", run: () => window.dispatchEvent(new Event("takenotes:open-template-picker")) },
        { label: "Version history…", run: () => void docsApi.openHistory(key) },
        { label: plain ? "Back to the page view" : "Edit as plain text…", run: () => setPlainDocs((cur) => { const n = new Set(cur); if (n.has(key)) n.delete(key); else n.add(key); return n; }) },
        { label: "---", run: () => undefined },
        { label: ws && isWslKind(ws.type) ? "Delete permanently…" : "Move to trash", danger: true, disabled: !entry, run: () => entry && void treeApi.removeEntry(entry) },
      ],
    });
  }, [docsApi, plainDocs, treeApi, workspaceApi.workspace, makeCopy]);

  // "/ Image…" opens a file picker; the picked image is imported like a drop.
  useEffect(() => {
    const onPick = (): void => {
      const doc = docsApi.activeTab;
      if (!doc) return;
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.multiple = true;
      input.onchange = () => {
        const files = Array.from(input.files ?? []);
        if (files.length === 0) return;
        void importAttachmentFiles(files, doc.relativePath).then((links) => {
          if (links.length > 0) window.dispatchEvent(new CustomEvent("takenotes:insert-attachment-text", { detail: links.join("\n") }));
        });
      };
      input.click();
    };
    window.addEventListener("takenotes:pick-image", onPick);
    return () => window.removeEventListener("takenotes:pick-image", onPick);
  }, [docsApi.activeTab, importAttachmentFiles]);

  // Esc toggles focus mode (only the page stays). It never competes with an
  // open menu, dialog, find bar or completion list: those take Esc first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape" || e.defaultPrevented || !workspaceApi.workspace) return;
      if (document.querySelector("dialog[open], .ui-menu, .ui-palette, .ui-popover, .cm-tooltip, .cm-panel, .fmt-bubble")) return;
      const inPage = !!(e.target as HTMLElement | null)?.closest?.(".cm-editor, .note-title-input");
      if (focusMode || (inPage && docsApi.activeTab)) { e.preventDefault(); setFocusMode((v) => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusMode, docsApi.activeTab, workspaceApi.workspace]);

  const validateTitle = useCallback((title: string): string | null => {
    const doc = docsApi.activeTab;
    if (!doc || title === "") return title === "" ? "Give the note a name." : null;
    if (/[<>:"/\\|?*]/.test(title)) return "Names can\u2019t contain / \\ : * ? \" < > |.";
    const dir = parentDir(doc.relativePath);
    const clash = treeApi.allFiles.some((f) => f.relativePath !== doc.relativePath && parentDir(f.relativePath) === dir && fileName(f.relativePath).replace(/\.md$/i, "").toLowerCase() === title.toLowerCase());
    return clash ? "A note with this name already exists in this folder." : null;
  }, [docsApi.activeTab, treeApi.allFiles]);

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
        <TitleBar workspace={null} platform={platform} onQuickOpen={() => {}} />
        <WelcomeScreen
          recents={recents.recentWorkspaces}
          servers={servers}
          opening={workspaceApi.opening}
          wslEnabled={Boolean(wslFeature)}
          onOpenFolder={() => void workspaceApi.openLocal()}
          onOpenWsl={() => void wslApi.open()}
          onCreate={() => setWsDialog({ kind: "create" })}
          onSignIn={() => setWsDialog({ kind: "server", address: "" })}
          onOpenRecent={(id) => (id ? void workspaceApi.openRecent(id) : void workspaceApi.openLocal())}
          onOpenServer={(address) => setWsDialog({ kind: "server", address })}>
          {updatesApi.dialog?.phase === "available" && updatesApi.dialog.latest && (
            <div className="update-banner" role="status">
              <span>Version {updatesApi.dialog.latest} is available.</span>
              <Button variant="primary" onClick={() => void updatesApi.download()}>Download &amp; install</Button>
            </div>
          )}
        </WelcomeScreen>
        {wslApi.dialog && <WslDialog dialog={wslApi.dialog} onDistro={(d) => void wslApi.fetchUsers(d)} onConnect={(data) => void wslApi.connect(data)} onClose={wslApi.close} onPairLink={() => { wslApi.close(); setWsDialog({ kind: "pair" }); }} />}
        {workspaceDialogs}
        {updatesApi.dialog && (
          <UpdateDialog dialog={updatesApi.dialog} version={version} onClose={updatesApi.close} onDownload={() => void updatesApi.download()} />
        )}
      </div>
    );
  }

  const openFromPage = (rel: string, line?: number): void => {
    setPage(null);
    void docsApi.openFile(rel).then(() => { void treeApi.reveal(rel); if (line) gotoLine(line); });
  };
  const pageBody = (v: PageView): JSX.Element => {
    const noIndex = <PageShell view={v}><p className="muted">No workspace index yet.</p></PageShell>;
    if (v === "today") {
      return todayGroups ? (
        <TodayPage
          groups={todayGroups.groups}
          today={todayGroups.today}
          daily={todayGroups.daily}
          recents={todayGroups.recents}
          onOpen={openFromPage}
          onToggle={(rel, line) => void toggleTask(rel, line)}
          onSchedule={(rel, line, hour) => void scheduleTaskAt(rel, line, hour)}
          onNewNote={() => commandsApi.executeCommand("note.new")}
          onNewTask={() => commandsApi.executeCommand("task.new")}
          onOpenDaily={() => { setPage(null); commandsApi.executeCommand("note.openToday"); }}
        />
      ) : noIndex;
    }
    if (v === "tasks") return <TasksPage entries={phase3Entries} today={todayKey} onOpen={openFromPage} onToggle={(rel, line) => void toggleTask(rel, line)} />;
    if (v === "calendar") {
      return todayGroups && linkGraph ? (
        <PageShell view={v}>
          <CalendarPane
            entries={linkGraph.entries}
            today={todayGroups.today}
            onOpenTask={(rel, line) => openFromPage(rel, line)}
            onOpenNote={(rel) => openFromPage(rel)}
            onReschedule={(rel, line, targetDate) => void rescheduleTask(rel, line, targetDate)}
          />
        </PageShell>
      ) : noIndex;
    }
    if (v === "tags") return <PageShell view={v}><TagsPane entries={phase3Entries} runSearch={runSearchQuery} /></PageShell>;
    if (v === "properties") {
      return (
        <PageShell view={v}>
          <PropertiesPane
            activeEntry={activeIndexEntry}
            entries={phase3Entries}
            registry={propertyRegistry}
            runSearch={runSearchQuery}
            onRename={(a, b) => renamePropertyEverywhere(a, b)}
            renaming={renamingProp}
          />
        </PageShell>
      );
    }
    if (v === "collections") {
      return (
        <PageShell view={v}>
          <CollectionsPane collections={collectionsApi} entries={phase3Entries} onOpen={(rel) => openFromPage(rel)} runSearch={runSearchQuery} />
        </PageShell>
      );
    }
    return linkGraph ? (
      <PageShell view={v}>
        <GraphPane
          entries={linkGraph.entries}
          edges={linkGraph.edges}
          activePath={docsApi.activeTab?.relativePath ?? null}
          onOpen={(rel) => openFromPage(rel)}
        />
      </PageShell>
    ) : noIndex;
  };

  const healthError = workspaceApi.healthError;
  return (
    <div className="app">
      {/* Step 9 keyboard entry: hidden until focused, jumps past the rail
        and sidebar straight to the note surface. */}
      <a
        href="#main-content"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >Skip to editor</a>
      {bridgeBanner}
      {!focusMode && (
        <TitleBar
          workspace={workspace}
          platform={platform}
          onQuickOpen={() => commandsApi.executeCommand("quickOpen.open")}
          onNewNote={() => commandsApi.executeCommand("note.new")}
          rightOpen={rightOpen}
          onToggleRight={() => setRightOpen((v) => !v)}
          switcher={
            <WorkspaceSwitcher
              workspace={workspace}
              recents={recents.recentWorkspaces.filter((r): r is RecentWorkspaceInfo => "id" in r && typeof r.id === "string")}
              dirtyCount={Object.values(docsApi.layout.docs).filter((d) => d.dirty && !d.loadError).length}
              onOpenRecent={(id) => void workspaceApi.openRecent(id)}
              onOpenFolder={() => void workspaceApi.openLocal()}
              onCreate={() => setWsDialog({ kind: "create" })}
              onClose={() => void workspaceApi.closeWorkspace()}
              onSaveAll={async () => {
                const keys = Object.values(docsApi.layout.docs).filter((d) => d.dirty && !d.loadError).map((d) => d.key);
                for (const k of keys) await docsApi.save(k);
                return true;
              }}
              onDiscardAll={() => { for (const d of Object.values(docsApi.layout.docs)) if (d.dirty) docsApi.discardDraft(d.key); }}
            />
          }
        />
      )}
      <div className="body">
        {!focusMode && settings.ribbonVisible && (
          <ActivityRail view={view} page={page} platform={platform} onView={(v) => { setView(v); setSidebarOpen(true); }} onPage={(v) => { setSettingsOpen(false); setPage((cur) => (cur === v ? null : v)); }} onSettings={() => setSettingsOpen(true)} onShortcuts={() => setShortcutsOpen(true)} />
        )}
        {!focusMode && sidebarOpen && (
          <>
            <aside className="sidebar" style={{ width: Math.min(360, Math.max(200, sidebarWidth)) }} aria-label="Sidebar">
              <div className="sidebar-head">
                <h2 className="sidebar-title" title={view === "files" ? workspace.displayName : undefined}>{VIEW_TITLES[view]}</h2>
                <div className="sidebar-actions">
                  {view === "files" ? (
                    <>
                      <IconButton label="Sort" title="Sort files" onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        const cur = treeApi.sort;
                        const pick = (key: "name" | "modified" | "created", dir: "asc" | "desc"): void => treeApi.setSort({ key, dir });
                        setMenu({ x: r.left, y: r.bottom + 4, items: [
                          { label: `${cur.key === "name" ? "✓ " : ""}Name`, run: () => pick("name", "asc") },
                          { label: `${cur.key === "modified" ? "✓ " : ""}Modified`, run: () => pick("modified", "desc") },
                          { label: `${cur.key === "created" ? "✓ " : ""}Created`, run: () => pick("created", "desc") },
                        ] });
                      }}><Icon name="sort" /></IconButton>
                      <IconButton title={`New note (${sc("note.new")})`} label="New note" onClick={() => commandsApi.executeCommand("note.new")}><Icon name="plus" /></IconButton>
                      <IconButton title="New folder" label="New folder" onClick={() => treeApi.beginCreate(treeApi.preferredNewNoteDir(), true)}><Icon name="folderPlus" /></IconButton>
                    </>
                  ) : (
                    <IconButton label={paneCollapsed[view] ? "Expand pane" : "Collapse pane"} onClick={() => togglePaneCollapse(view)}>
                      <Icon name={paneCollapsed[view] ? "chevronRight" : "chevronDown"} />
                    </IconButton>
                  )}
                </div>
              </div>
              <div
                className="sidebar-body"
                onKeyDown={treeApi.onTreeKeyDown}
                onDragOver={(e) => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
                onDrop={(e) => {
                  if (!e.dataTransfer.files.length) return;
                  e.preventDefault();
                  // Sidebar drops import without insertion: notes via the
                  // Step 2 copy-in, binaries per the attachment policy
                  // (resolved with no active note — same-folder degrades
                  // to the drop directory, subfolder nests under it).
                  void (async () => {
                    const files = Array.from(e.dataTransfer.files);
                    const dir = treeApi.preferredNewNoteDir();
                    await importNoteFiles(files.filter((f) => NOTE_FILE_RE.test(f.name)), dir);
                    // A synthetic in-dir note path: same-folder lands in
                    // the drop directory, subfolder nests under it.
                    await importAttachmentFiles(files.filter((f) => !NOTE_FILE_RE.test(f.name)), dir ? `${dir}/_.md` : "");
                  })();
                }}
              >
                {paneCollapsed[view] ? (
                  <div className="panel-title">{VIEW_TITLES[view]} (collapsed)</div>
                ) : view === "files" ? (
                  <>
                    {treeApi.creating && (
                      <div className="tree-row">
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
                        <p style={{ fontSize: 13, color: "var(--text2)" }}>Couldn&apos;t list this workspace.</p>
                        <p className="inline-error">{healthError}</p>
                      </div>
                    ) : (
                      <FileTree
                        fileCounts={folderCounts}
                        onMove={(rels, dir) => void treeApi.moveEntries(rels, dir)}
                        entries={treeApi.entries}
                        tree={treeApi.tree}
                        activePath={docsApi.activeTab?.relativePath ?? null}
                        onToggle={(d) => void treeApi.toggleDir(d)}
                        onOpen={(en) => {
                          if (en.fileClass === "markdown" || en.fileClass === "text" || isCanvasPath(en.relativePath)) { void docsApi.openFile(en.relativePath).then(() => void treeApi.reveal(en.relativePath)); }
                          else toast("Only notes, text and canvas files open here.");
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
                    notes={searchApi.notes}
                    matchCase={searchApi.matchCase}
                    onMatchCase={searchApi.setMatchCase}
                    context={searchApi.context}
                    onContext={searchApi.setContext}
                    notice={indexNotice}
                    onPin={(q) => { void favoritesApi.addEntry(favoritesApi.doc.groups[0]?.name ?? "default", { type: "search", target: q }); toast("Search saved to Favourites."); }}
                    onOpen={(rel, line) => {
                      void docsApi.openFile(rel).then(() => {
                        void treeApi.reveal(rel);
                        if (line) window.setTimeout(() => gotoLine(line), 60);
                      });
                    }}
                  />
                ) : view === "recent" ? (
                  <div role="list" aria-label="Recent notes">
                    {(() => {
                      const known = new Set(treeApi.allFiles.map((f) => f.relativePath));
                      const rows = recents.recents.filter((r) => known.has(r));
                      return rows.length === 0 ? (
                        <EmptyState title="Nothing opened yet" description="Notes you open show up here." />
                      ) : rows.map((rel) => (
                        <button key={rel} role="listitem" className="tree-row recent-row" onClick={() => void docsApi.openFile(rel).then(() => void treeApi.reveal(rel))}>
                          <span className="label">{fileName(rel).replace(/\.md$/i, "")}</span>
                          {parentDir(rel) && <span className="count">{parentDir(rel)}</span>}
                        </button>
                      ));
                    })()}
                  </div>
                ) : view === "outline" ? (
                  <OutlinePane content={docsApi.activeTab?.content ?? null} onNavigate={gotoLine} />
                ) : view === "today" ? (
                  todayGroups ? (
                    <TodayPane
                      groups={todayGroups.groups}
                      today={todayGroups.today}
                      daily={todayGroups.daily}
                      recents={todayGroups.recents}
                      onOpen={(rel, line) => {
                        void docsApi.openFile(rel).then(() => {
                          if (line) gotoLine(line);
                        });
                      }}
                      onNewNote={() => commandsApi.executeCommand("note.new")}
                      onNewTask={() => commandsApi.executeCommand("task.new")}
                      onOpenDaily={() => commandsApi.executeCommand("note.openToday")}
                    />
                  ) : (
                    <div className="panel-title">No workspace index yet.</div>
                  )
                ) : view === "calendar" ? (
                  todayGroups && linkGraph ? (
                    <CalendarPane
                      entries={linkGraph.entries}
                      today={todayGroups.today}
                      onOpenTask={(rel, line) => {
                        void docsApi.openFile(rel).then(() => {
                          gotoLine(line);
                        });
                      }}
                      onOpenNote={(rel) => openLinkTarget(rel)}
                      onReschedule={(rel, line, targetDate) => void rescheduleTask(rel, line, targetDate)}
                    />
                  ) : (
                    <div className="panel-title">No workspace index yet.</div>
                  )
                ) : view === "tags" ? (
                  <TagsPane entries={phase3Entries} runSearch={runSearchQuery} />
                ) : view === "properties" ? (
                  <PropertiesPane
                    activeEntry={activeIndexEntry}
                    entries={phase3Entries}
                    registry={propertyRegistry}
                    runSearch={runSearchQuery}
                    onRename={(a, b) => renamePropertyEverywhere(a, b)}
                    renaming={renamingProp}
                  />
                ) : view === "collections" ? (
                  <CollectionsPane
                    collections={collectionsApi}
                    entries={phase3Entries}
                    onOpen={(rel) => { void docsApi.openFile(rel).then(() => void treeApi.reveal(rel)); }}
                    runSearch={runSearchQuery}
                  />
                ) : view === "graph" ? (
                  linkGraph ? (
                    <GraphPane
                      entries={linkGraph.entries}
                      edges={linkGraph.edges}
                      activePath={docsApi.activeTab?.relativePath ?? null}
                      onOpen={(rel) => { void docsApi.openFile(rel).then(() => void treeApi.reveal(rel)); }}
                    />
                  ) : (
                    <div className="panel-title">No workspace index yet.</div>
                  )
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
              <div className="sidebar-foot">
                <span>{treeApi.allFiles.length.toLocaleString()} {treeApi.allFiles.length === 1 ? "note" : "notes"}</span>
                <span className="muted">{workspace.displayName}</span>
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
        <main className="main" id="main-content" tabIndex={-1} aria-label="Editor">
          {healthError && (
            <Notice className="pane-notice" tone="danger" announcement="assertive" title="Connection lost"
              actions={<Button variant="primary" onClick={() => refreshWorkspace()}>Reconnect</Button>}>
              Keep writing. Changes save when it comes back. {healthError}
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
                onDragOver={(e) => { if (e.dataTransfer.types.includes("takenotes/rel-path")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } else if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
                onDrop={(e) => {
                  const rel = e.dataTransfer.getData("takenotes/rel-path");
                  if (rel) {
                    e.preventDefault();
                    window.dispatchEvent(new CustomEvent("takenotes:insert-link", { detail: rel }));
                    return;
                  }
                  // External files: import + link/embed at the cursor.
                  // (The cursor usually sits at the drop point — mousedown
                  // precedes drop.) preventDefault blocks CodeMirror's
                  // default file-drop handling.
                  if (e.dataTransfer.files.length === 0 || !doc) return;
                  e.preventDefault();
                  void importEditorFiles(Array.from(e.dataTransfer.files), doc.relativePath);
                }}
                onPaste={(e) => {
                  // Pasted files (e.g. screenshots) import like drops;
                  // plain text paste is untouched.
                  const files = e.clipboardData ? Array.from(e.clipboardData.files) : [];
                  if (files.length === 0 || !doc) return;
                  e.preventDefault();
                  void importEditorFiles(files, doc.relativePath);
                }}
              >
                {!focusMode && (
                  <TabStrip
                    tabs={docs}
                    activeKey={docsApi.layout.activeKey}
                    onActivate={(k) => { setPage(null); setSettingsOpen(false); docsApi.activateDocKey(k); }}
                    onClose={(k) => requestCloseTab(k)}
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
                  <Notice className="pane-notice" tone="warning" announcement="assertive" title="This note was changed somewhere else."
                    actions={<>
                      <Button onClick={() => void docsApi.keepMyVersion(doc.key)}>Keep mine</Button>
                      <Button variant="primary" onClick={() => void docsApi.reloadFromDisk(doc.key)}>Use the other one</Button>
                    </>}>
                    You also have changes in {fileName(doc.relativePath)}, so nothing was merged. Both versions are safe.
                  </Notice>
                )}
                {settingsOpen ? (
                  <SettingsDialog asPage settings={settings} onChange={setSettings} version={version} platform={platform} hotkeys={hotkeys} updatesEnabled={platform.capabilities.updates} onCheckUpdates={() => void updatesApi.check(true)} mcp={getBridge()?.mcp} onClose={() => setSettingsOpen(false)} />
                ) : page ? (
                  pageBody(page)
                ) : !doc ? (
                  <EmptyState className="pane-empty" title="Choose a note to start writing."
                    description={<><kbd className="k">{sc("quickOpen.open")}</kbd> Quick open · <kbd className="k">{sc("note.new")}</kbd> New note</>}
                    actions={treeApi.entries.length === 0 && !treeApi.sidebarLoading ? <Button variant="primary" onClick={commandsApi.newNote}>Create note</Button> : undefined} />
                ) : doc.loadError ? (
                  <EmptyState className="pane-empty" title={`Couldn’t open ${fileName(doc.relativePath)}`}
                    description={`${doc.loadError} Your file is untouched.`}
                    actions={<Button onClick={() => requestCloseTab(doc.key)}>Close tab</Button>} />
                ) : isCanvasPath(doc.relativePath) ? (
                  <CanvasEditor
                    docKey={doc.key}
                    content={doc.content}
                    onEdit={docsApi.onEdit}
                    onOpenNote={(rel) => { void docsApi.openFile(rel).then(() => void treeApi.reveal(rel)); }}
                  />
                ) : (
                  <PaneView
                    docKey={doc.key}
                    content={doc.content}
                    relativePath={doc.relativePath}
                    lineNumbers={settings.lineNumbers}
                    wordWrap={settings.wordWrap}
                    livePreview={settings.livePreview && !plainDocs.has(doc.key)}
                    validateTitle={validateTitle}
                    linkFormat={settings.linkFormat}
                    useWikilinks={settings.useWikilinks}
                    workspaceId={workspace?.workspaceId ?? ""}
                    fullWidth={settings.fullWidth}
                    inlineTitle={settings.inlineTitle}
                    reportCursor
                    titleTools={(() => {
                      const group = favoritesApi.doc.groups.find((g) => g.entries.some((en) => en.type === "file" && en.target === doc.relativePath));
                      const favIndex = group ? group.entries.findIndex((en) => en.type === "file" && en.target === doc.relativePath) : -1;
                      return (
                        <>
                          <IconButton
                            className={favIndex >= 0 ? "on" : undefined}
                            label={favIndex >= 0 ? "Remove from favorites" : "Add to favorites"}
                            aria-pressed={favIndex >= 0}
                            onClick={() => {
                              if (group && favIndex >= 0) void favoritesApi.removeEntry(group.name, favIndex);
                              else void favoritesApi.addEntry(favoritesApi.doc.groups[0]?.name ?? "default", { type: "file", target: doc.relativePath });
                            }}
                          ><Icon name="star" /></IconButton>
                          <IconButton label="More actions for this note" onClick={(e) => showNoteMenu(doc.key, e)}><Icon name="more" /></IconButton>
                        </>
                      );
                    })()}
                    meta={(() => {
                      const dirName = doc.relativePath.includes("/") ? doc.relativePath.slice(0, doc.relativePath.lastIndexOf("/")) : workspace?.displayName ?? "";
                      const tags = [...new Set((doc.content.match(/(?:^|\s)#([A-Za-z][\w/-]*)/g) ?? []).map((t) => t.trim().slice(1).toLowerCase()))].slice(0, 6);
                      return (
                        <>
                          <span>{dirName}</span>
                          <i className="sep">·</i>
                          <span>{editedLabel(doc.dirty || Boolean(doc.savedAt) ? Date.now() : treeApi.allFiles.find((f) => f.relativePath === doc.relativePath)?.mtimeMs)}</span>
                          <i className="sep">·</i>
                          <span>{docsApi.words} {docsApi.words === 1 ? "word" : "words"}</span>
                          {tags.map((t) => <span key={t} className="tag">#{t}</span>)}
                        </>
                      );
                    })()}
                    onEdit={docsApi.onEdit}
                    onCursor={docsApi.handleCursor}
                    onTitleCommit={async (title) => {
                      const changed = await docsApi.renameNoteTitle(doc.key, title);
                      if (changed && workspace) await refreshWorkspaceFlow({ tree: treeApi, search: searchApi }, workspace);
                    }}
                    onOpenWikilink={(target) => {
                      const rel = resolveWikilinkTarget(target, treeApi.allFiles.map((f) => f.relativePath));
                      // Ctrl/Cmd+click on an unresolved wikilink creates the
                      // note (same follow-to-create as the outgoing pane).
                      if (rel) void docsApi.openFile(rel).then(() => void treeApi.reveal(rel));
                      else if (doc.relativePath) void followLink(target, doc.relativePath);
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
        {!focusMode && workspace && linkGraph && rightOpen && !page && !settingsOpen && (
          <SidePanel
            doc={docsApi.activeTab && !isCanvasPath(docsApi.activeTab.relativePath)
              ? { key: docsApi.activeTab.key, relativePath: docsApi.activeTab.relativePath, content: docsApi.activeTab.content } : null}
            entries={linkGraph.entries}
            edges={linkGraph.edges}
            registry={propertyRegistry}
            onClose={() => setRightOpen(false)}
            onGotoLine={gotoLine}
            onOpen={openLinkTarget}
            onCreate={(target) => docsApi.activeTab && void followLink(target, docsApi.activeTab.relativePath)}
            onLinkIt={(from, matched, target) => void linkMention(from, matched, target)}
            onEditContent={(key, content) => docsApi.onEdit(key, content)}
            onFixAsText={(key) => setPlainDocs((cur) => new Set(cur).add(key))}
            onPinHeading={(rel, heading) => { void favoritesApi.addEntry(favoritesApi.doc.groups[0]?.name ?? "default", { type: "heading", target: `${rel}#${heading}` }); toast("Heading added to Favourites."); }}
          />
        )}
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
          updateVersion={pendingUpdate}
          onReviewUpdate={() => void updatesApi.check(true)}
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
          tags={aggregateTags(phase3Entries ?? []).map((t) => ({ tag: t.tag, count: t.files }))}
          onSearch={(q) => { setPage(null); setSettingsOpen(false); setView("search"); setSidebarOpen(true); searchApi.setQuery(q); }}
          onOpenTag={(tag) => runSearchQuery(`tag:${tag}`)}
          onAddTask={async (text, scheduled) => { await captureTask({ text, ...(scheduled ? { scheduled } : {}), target: "inbox" }); return true; }}
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
      {shortcutsOpen && <ShortcutsDialog commands={commandsApi.commands} onClose={() => setShortcutsOpen(false)} />}
      {taskDialogOpen && workspaceApi.workspace && (
        <TaskDialog
          target={settings.taskCaptureTarget}
          onSubmit={(input) => void captureTask(input)}
          onClose={() => setTaskDialogOpen(false)}
        />
      )}
      {fileDetails && docsApi.layout.docs[fileDetails] && (() => {
        const d = docsApi.layout.docs[fileDetails]!;
        const f = treeApi.allFiles.find((x) => x.relativePath === d.relativePath);
        const rows: Array<[string, string]> = [
          ["Name", fileName(d.relativePath).replace(/\.md$/i, "")],
          ["Folder", parentDir(d.relativePath) || "Top folder"],
          ["Edited", editedLabel(f?.mtimeMs)],
          ["Size", `${new Blob([d.content]).size.toLocaleString()} bytes`],
          ["Words", String(docsApi.words)],
        ];
        return (
          <Dialog title="File details" onClose={() => setFileDetails(null)} footer={<Button onClick={() => setFileDetails(null)}>Close</Button>}>
            <dl className="pair-preview">{rows.map(([k, v]) => (<span key={k} style={{ display: "contents" }}><dt>{k}</dt><dd>{v}</dd></span>))}</dl>
          </Dialog>
        );
      })()}
      {templatePickerOpen && workspaceApi.workspace && docsApi.activeTab && (
        <TemplatePicker
          allPaths={treeApi.entries.filter((e) => e.kind === "file").map((e) => e.relativePath)}
          templateFolder={settings.templateFolder}
          onPick={(rel) => void insertTemplate(rel)}
          onClose={() => setTemplatePickerOpen(false)}
        />
      )}
      {importOpen && workspaceApi.workspace && (
        <ImportDialog
          workspaceId={workspaceApi.workspace.workspaceId}
          attachmentLocation={settings.attachmentLocation}
          attachmentFolder={settings.attachmentFolder}
          onClose={() => setImportOpen(false)}
          onDone={() => void convergeImport()}
        />
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
      {dirtyPrompt && (
        <Dialog
          title="Unsaved changes"
          onClose={() => setDirtyPrompt(null)}
          initialFocus={dirtySaveRef}
          footer={<div className="dirty-prompt-actions"><Button variant="destructive" onClick={() => confirmDirtyDiscard()}>Discard changes</Button><Button variant="primary" ref={dirtySaveRef as React.Ref<HTMLButtonElement>} onClick={() => void confirmDirtySave()}>Save</Button></div>}
        >
          {dirtyPrompt.kind === "tab" ? (
            <p>{fileName(dirtyPrompt.rel)} has unsaved changes. Save before closing? Your edits are still safe.</p>
          ) : (
            <p>{dirtyPrompt.dirty.length === 1 ? `${fileName(dirtyPrompt.dirty[0]!.rel)} has unsaved changes.` : `${dirtyPrompt.dirty.length} open notes under ${dirtyPrompt.entry.name} have unsaved changes.`} Save before deleting? Cancel keeps everything open.</p>
          )}
        </Dialog>
      )}
    </div>
  );
}
