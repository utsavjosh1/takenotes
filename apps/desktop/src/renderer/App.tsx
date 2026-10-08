import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import { resolveTheme } from "@takenotes/ui";
import { appearanceVars, clampZoom, stepZoom, type AppearanceTheme } from "@takenotes/core/appearance/appearance";
import { Button, EmptyState, IconButton, Notice } from "@takenotes/ui/dom";
import type { DirectoryEntry, WorkspaceInfo } from "@takenotes/contracts/ipc";
import type { CommandId } from "@takenotes/core/commands/registry";
import { usePlatform } from "./hooks/use-platform";
import { isWslKind } from "@takenotes/platform/filesystem";
import { TitleBar, ActivityRail, StatusBar, type SidebarView } from "./components/chrome";
import { PaneView } from "./components/pane-view";
import { BacklinksPane, OutgoingPane } from "./components/backlinks";
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
import { lineForBlockId, lineForHeadingFragment, previewExcerpt } from "@takenotes/core/outline/extract";
import type { ParsedTakenotesUri } from "@takenotes/core/uri/parse";
import { renderMarkdown } from "@takenotes/core/markdown/render";
import { SearchPanel } from "./components/search";
import { ContextMenu, Toasts, TabStrip } from "./components/overlays";
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
import { templateDate } from "@takenotes/core/productivity/templates";
import { SettingsDialog } from "./components/settings";
import { WslDialog } from "./components/wsl-dialog";
import { UpdateDialog } from "./components/update-dialog";
import { HistoryDialog } from "./components/history-dialog";
import { buildFileMenu, buildSidebarMenu, buildTabMenu, type MenuOps } from "./components/menus";
import { Icon } from "./components/icons";
import { getBridge } from "./bridge";

/** Note-class files (imported as notes, never as attachments). */
const NOTE_FILE_RE = /\.(md|markdown|txt)$/i;

/** MIME subtype for fallback paste names (`image/png` → `png`). */
function mimeExt(mime: string): string {
  return (mime.split("/")[1]?.split(";")[0]?.split("+")[0] ?? "").replace(/[^a-z0-9]/gi, "");
}
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
      return { files: false, search: false, outline: false, favorites: false, today: false, calendar: false, ...JSON.parse(localStorage.getItem("takenotes.paneCollapsed") ?? "{}") };
    } catch {
      return { files: false, search: false, outline: false, favorites: false, today: false, calendar: false };
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
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
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
    let line: string;
    try {
      line = formatTaskLine(input.text, input.due);
    } catch {
      toast("Couldn't add the task: invalid text or due date.", "error");
      return;
    }
    let rel = INBOX_RELATIVE_PATH;
    let base: { content: string; hash: string; newlineStyle: "lf" | "crlf"; hadBom: boolean } | null = null;
    let createdNew = false;
    if (settings.taskCaptureTarget === "daily") {
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
    toast(`Task added to ${rel}.`);
  }, [workspaceApi.workspace, settings.taskCaptureTarget, toast, commandsApi, bumpIndex, treeApi, docsApi]);

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

  // Today pane (productivity step 3): overdue + due-today + scheduled-today
  // derived from the document index, memoised on the index version so every
  // mutation (typing, capture, drag) refreshes it. No database anywhere.
  const todayGroups = useMemo(() => {
    if (!workspace) return null;
    try {
      const today = templateDate(new Date());
      return { today, groups: collectTodayTasks(workspaceIndex.list(workspace.workspaceId), today) };
    } catch {
      return null;
    }
  }, [workspace?.workspaceId, indexVersion]);

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
    const result = await linkMentionFlow({
      readFile: (rel) => bridge.file.read(ws.workspaceId, rel),
      writeFile: ({ rel, content, expectedHash, newlineStyle, hadBom }) =>
        bridge.file.write({ workspaceId: ws.workspaceId, relativePath: rel, content, expectedHash, newlineStyle, hadBom }),
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
                  <div className="panel-title">{view === "files" ? "Explorer" : view === "search" ? "Search" : view === "outline" ? "Outline" : view === "today" ? "Today" : view === "calendar" ? "Calendar" : view === "tags" ? "Tags" : view === "properties" ? "Properties" : view === "collections" ? "Collections" : view === "graph" ? "Graph" : "Favorites"} (collapsed)</div>
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
                          if (en.fileClass === "markdown" || en.fileClass === "text" || isCanvasPath(en.relativePath)) { void docsApi.openFile(en.relativePath).then(() => void treeApi.reveal(en.relativePath)); }
                          else toast("Only Markdown, text, and canvas files open in this MVP.");
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
                ) : view === "today" ? (
                  todayGroups ? (
                    <TodayPane
                      groups={todayGroups.groups}
                      today={todayGroups.today}
                      onOpen={(rel, line) => {
                        void docsApi.openFile(rel).then(() => {
                          gotoLine(line);
                        });
                      }}
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
                    livePreview={settings.livePreview}
                    linkFormat={settings.linkFormat}
                    useWikilinks={settings.useWikilinks}
                    workspaceId={workspace?.workspaceId ?? ""}
                    fullWidth={settings.fullWidth}
                    inlineTitle={settings.inlineTitle}
                    reportCursor
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
        {!focusMode && workspace && docsApi.activeTab && linkGraph && (
          <aside className="sidebar right" aria-label="Links">
            <div className="sidebar-head">
              <span className="name" title={docsApi.activeTab.relativePath}>Links</span>
            </div>
            <div className="sidebar-body">
              <BacklinksPane
                activePath={docsApi.activeTab.relativePath}
                edges={linkGraph.edges}
                entries={linkGraph.entries}
                onOpen={openLinkTarget}
                onLinkMention={(from, matched, target) => void linkMention(from, matched, target)}
              />
              <OutgoingPane
                activePath={docsApi.activeTab.relativePath}
                edges={linkGraph.edges}
                entries={linkGraph.entries}
                onOpen={openLinkTarget}
                onCreateLink={(target) => void followLink(target, docsApi.activeTab!.relativePath)}
                onLinkMention={(from, matched, target) => void linkMention(from, matched, target)}
              />
            </div>
          </aside>
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
      {taskDialogOpen && workspaceApi.workspace && (
        <TaskDialog
          target={settings.taskCaptureTarget}
          onSubmit={(input) => void captureTask(input)}
          onClose={() => setTaskDialogOpen(false)}
        />
      )}
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
      {settingsOpen && (
        <SettingsDialog settings={settings} onChange={setSettings} version={version} platform={platform} hotkeys={hotkeys} updatesEnabled={platform.capabilities.updates} onCheckUpdates={() => void updatesApi.check(true)} mcp={getBridge()?.mcp} onClose={() => setSettingsOpen(false)} />
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
