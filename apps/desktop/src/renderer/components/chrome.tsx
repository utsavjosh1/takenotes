import type { JSX, ReactNode } from "react";
import { Badge, Button, Icon as SharedIcon, IconButton, Pill, Rail, StatusBar as SharedStatusBar, TitleBar as SharedTitleBar, type RailItem } from "@takenotes/ui/dom";
import appMarkUrl from "../assets/brand/takenotes-symbol-violet.svg";
import type { WorkspaceInfo } from "@takenotes/contracts/ipc";
import { isWslKind } from "@takenotes/platform/filesystem";
import { statusSegments, type DocSaveView } from "../status";
import { SAVE_STATES } from "@takenotes/core/save/decisions";
import type { PlatformState } from "../hooks/use-platform";
import type { PageView } from "./pages";

/* ---------- title bar ---------- */
export function TitleBar({
  workspace,
  platform,
  onQuickOpen,
  onNewNote,
  rightOpen,
  onToggleRight,
  switcher,
}: {
  workspace: WorkspaceInfo | null;
  platform: PlatformState;
  onQuickOpen: () => void;
  onNewNote?: () => void;
  rightOpen?: boolean;
  onToggleRight?: () => void;
  /** Interactive workspace switcher; falls back to a static badge. */
  switcher?: ReactNode;
}): JSX.Element {
  const quickOpen = platform.shortcutLabel("quickOpen.open");
  const newNote = platform.shortcutLabel("note.new");
  const start = (
    <>
      <img src={appMarkUrl} className="app-mark" alt="" aria-hidden="true" draggable={false} />
      {workspace && switcher ? switcher : workspace ? (
        <span className="ws-switch" title={workspace.displayName}>
          <Badge tone={isWslKind(workspace.type) ? "neutral" : "neutral"}>
            {isWslKind(workspace.type) ? "WSL" : workspace.type === "macos-local" ? "macOS" : workspace.type === "linux-local" ? "Linux" : "Windows"}
          </Badge>
          <span className="ws-name">{workspace.displayName}</span>
        </span>
      ) : null}
    </>
  );
  const center = (
    <button
      className="quickopen-launcher"
      onClick={onQuickOpen}
      title={workspace ? `Quick open (${quickOpen})` : "Open a workspace before using quick open"}
      aria-label={workspace ? "Quick open notes" : "Quick open unavailable until a workspace is open"}
      disabled={!workspace}
    >
      <SharedIcon name="search" size="sm" />
      <span>Search files…</span>
      <kbd className="ui-kbd">{quickOpen}</kbd>
    </button>
  );
  const end = (
    <>
      {workspace && onToggleRight && (
        <IconButton label="Toggle side panel" title="Toggle side panel" aria-pressed={rightOpen} onClick={onToggleRight}>
          <SharedIcon name="split" size="sm" />
        </IconButton>
      )}
      {workspace && onNewNote && (
        <Button size="sm" variant="primary" onClick={onNewNote} title={`New note (${newNote})`} aria-label="New note">
          <SharedIcon name="plus" size="xs" />New
        </Button>
      )}
    </>
  );
  return <SharedTitleBar start={start} center={center} end={end} />;
}

/* ---------- activity rail ---------- */
/** Step 2 shell seam: fixed-order left panes. Right sidebar is an empty
 * slot until Steps 3/4/6 fill it; pane drag-reorder deferred. */
export const SIDEBAR_VIEWS = ["files", "search", "outline", "recent", "favorites", "today", "calendar", "tags", "properties", "collections", "graph"] as const;
export type SidebarView = (typeof SIDEBAR_VIEWS)[number];
export const VIEW_TITLES: Record<SidebarView, string> = {
  files: "Files", search: "Search", outline: "On this page", recent: "Recent", favorites: "Favourites", today: "Today",
  calendar: "Calendar", tags: "Tags", properties: "Details", collections: "Collections", graph: "Graph",
};

export function ActivityRail({
  view,
  page,
  platform,
  onView,
  onPage,
  onSettings,
  onShortcuts,
}: {
  view: SidebarView;
  page: PageView | null;
  platform: PlatformState;
  onView: (v: SidebarView) => void;
  onPage: (v: PageView) => void;
  onSettings: () => void;
  onShortcuts: () => void;
}): JSX.Element {
  const searchLabel = platform.shortcutLabel("search.open");
  const settingsLabel = platform.shortcutLabel("settings.open");
  const todayLabel = platform.shortcutLabel("today.open");
  const item = (id: string, label: string, icon: RailItem["icon"], active: boolean, onSelect: () => void, hint?: string): RailItem =>
    ({ id, label, icon, active, onSelect, ...(hint ? { hint } : {}) });
  const items: RailItem[] = [
    item("files", "Files", "file", view === "files" && !page, () => onView("files")),
    item("search", "Search", "search", view === "search" && !page, () => onView("search"), searchLabel),
    item("favorites", "Favourites", "star", view === "favorites" && !page, () => onView("favorites")),
    item("recent", "Recent", "today", view === "recent" && !page, () => onView("recent")),
    item("calendar", "Calendar", "grid", page === "calendar", () => onPage("calendar")),
    item("tags", "Tags", "tag", page === "tags", () => onPage("tags")),
    item("tasks", "Tasks", "tasks", page === "tasks", () => onPage("tasks")),
    item("today", "Today", "calendar", page === "today", () => onPage("today"), todayLabel),
  ];
  const footer: RailItem[] = [
    item("shortcuts", "Shortcuts", "keyboard", false, onShortcuts),
    item("settings", "Settings", "gear", false, onSettings, settingsLabel),
  ];
  return <Rail items={items} footer={footer} label="Activity" />;
}

/* ---------- status bar ---------- */
/** Identity strip (P1-06): `Workspace name · Windows|WSL [distro · user] ·
 * Saved|Dirty|Conflict · connection · index (n files)`. Distro/user come
 * from the explicit WorkspaceInfo identity (P1-03) — never parsed. */
export function StatusBar({
  workspace,
  words,
  line,
  col,
  doc,
  savedAt,
  connection,
  fileCount,
  indexWarning,
  onOpenHistory,
  updateVersion,
  onReviewUpdate,
}: {
  workspace: WorkspaceInfo | null;
  words: number;
  line: number;
  col: number;
  doc: DocSaveView;
  savedAt: string;
  connection: "connected" | "disconnected" | "reconnecting" | "failed";
  fileCount: number;
  /** Completeness notice from the parse-once index build (H-04): when
   * safety bounds may have omitted notes, the strip says so. */
  indexWarning: string | null;
  /** Recovery history for the active note (moved down from the editor
   * pane-bar so the note surface stays chrome-free). */
  onOpenHistory?: () => void;
  /** Newer version found by the update check; the pill outlives the dialog. */
  updateVersion?: string | null;
  onReviewUpdate?: () => void;
}): JSX.Element {
  if (!workspace) {
    // Step 9: no live region here — words/cursor update per keystroke and
    // must never announce. Save/connection states (below) are the only
    // polite announcements in the strip.
    return <SharedStatusBar start={<span>No workspace</span>} end={<><span>{words} words</span><span>Ln {line}, Col {col}</span></>} />;
  }
  const seg = statusSegments({
    displayName: workspace.displayName,
    kind: workspace.type,
    distro: workspace.distro,
    linuxUser: workspace.linuxUser,
    connection,
    doc,
    savedAt,
    fileCount,
  });
  const badSave = doc === "conflict" || doc === "error" || doc === "deleted" || doc === "disconnected";
  const badConn = connection === "disconnected" || connection === "failed";
  return (
    <SharedStatusBar
      start={<>
        <Pill tone={badConn ? "bad" : "ok"} dot title={`Workspace: ${workspace.displayName}`}>{seg.workspace} · {seg.platform} · {seg.connection}</Pill>
        <span role="status">
          {seg.save && <Pill title={doc === "clean" || doc === "error" ? undefined : SAVE_STATES[doc].tip} tone={badSave ? "bad" : doc === "unsaved" || doc === "saving" || doc === "readonly" ? "warn" : "ok"} dot>{seg.save}</Pill>}
        </span>
        {indexWarning && <Pill tone="warn" title={indexWarning} role="note">Index partial</Pill>}
        {updateVersion && onReviewUpdate && (
          <Button size="sm" variant="ghost" onClick={onReviewUpdate} title="Review the available update">Update {updateVersion} available · Review</Button>
        )}
      </>}
      end={<>
        {onOpenHistory && <Button size="sm" variant="ghost" onClick={onOpenHistory} title="Open recovery history" aria-label="Open recovery history">History</Button>}
        <span>{words} {words === 1 ? "word" : "words"}</span>
        <span title="Notes in this workspace">{fileCount.toLocaleString()} notes</span>
      </>}
    />
  );
}
