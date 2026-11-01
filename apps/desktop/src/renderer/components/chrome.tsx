import type { JSX, ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import appMarkUrl from "../assets/brand/takenotes-symbol-violet.svg";
import type { WorkspaceInfo } from "@takenotes/contracts/ipc";
import { isWslKind } from "@takenotes/platform/filesystem";
import { statusSegments } from "../status";
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
  return (
    <header className="titlebar" role="banner">
      <img src={appMarkUrl} className="app-mark" alt="" aria-hidden="true" draggable={false} />
      {workspace && switcher ? switcher : workspace ? (
        <span className="ws-switch" title={workspace.displayName}>
          <span className={`kind ${isWslKind(workspace.type) ? "kind-wsl" : "kind-local"}`}>
            {isWslKind(workspace.type) ? "WSL" : workspace.type === "macos-local" ? "macOS" : workspace.type === "linux-local" ? "Linux" : "Windows"}
          </span>
          <span className="ws-name">{workspace.displayName}</span>
        </span>
      ) : null}
      <button
        className="quickopen-launcher"
        onClick={onQuickOpen}
        title={workspace ? `Quick open (${quickOpen})` : "Open a workspace before using quick open"}
        aria-label={workspace ? "Quick open notes" : "Quick open unavailable until a workspace is open"}
        disabled={!workspace}
      >
        <Icon name="search" />
        <span>Search files…</span>
        <kbd>{quickOpen}</kbd>
      </button>
      {workspace && onToggleRight && (
        <button className={`titlebar-icon${rightOpen ? " on" : ""}`} onClick={onToggleRight} aria-pressed={rightOpen} title="Toggle side panel" aria-label="Toggle side panel">
          <Icon name="panel" />
        </button>
      )}
      {workspace && onNewNote && (
        <button className="titlebar-new" onClick={onNewNote} title={`New note (${newNote})`} aria-label="New note">
          <Icon name="plus" />
          New
        </button>
      )}
    </header>
  );
}

/* ---------- activity rail ---------- */
/** Step 2 shell seam: fixed-order left panes. Right sidebar is an empty
 * slot until Steps 3/4/6 fill it; pane drag-reorder deferred. */
export const SIDEBAR_VIEWS = ["files", "search", "outline", "recent", "favorites", "today", "calendar", "tags", "properties", "collections", "graph"] as const;
export type SidebarView = (typeof SIDEBAR_VIEWS)[number];
export const VIEW_TITLES: Record<SidebarView, string> = {
  files: "Files", search: "Search", outline: "Outline", recent: "Recent", favorites: "Favourites", today: "Today",
  calendar: "Calendar", tags: "Tags", properties: "Properties", collections: "Collections", graph: "Graph",
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
  const items: Array<{ key: string; label: string; icon: IconName; active: boolean; hint?: string; run: () => void }> = [
    { key: "files", label: "Files", icon: "files", active: view === "files" && !page, run: () => onView("files") },
    { key: "search", label: "Search", icon: "search", active: view === "search" && !page, hint: searchLabel, run: () => onView("search") },
    { key: "favorites", label: "Favourites", icon: "star", active: view === "favorites" && !page, run: () => onView("favorites") },
    { key: "recent", label: "Recent", icon: "clock", active: view === "recent" && !page, run: () => onView("recent") },
    { key: "calendar", label: "Calendar", icon: "grid", active: page === "calendar", run: () => onPage("calendar") },
    { key: "tags", label: "Tags", icon: "tag", active: page === "tags", run: () => onPage("tags") },
    { key: "tasks", label: "Tasks", icon: "tasks", active: page === "tasks", run: () => onPage("tasks") },
    { key: "today", label: "Today", icon: "calendar", active: page === "today", hint: todayLabel, run: () => onPage("today") },
  ];
  return (
    <nav className="rail" aria-label="Activity">
      {items.map((it) => (
        <button key={it.key} className={`rail-btn${it.active ? " active" : ""}`} onClick={it.run}
          title={it.hint ? `${it.label} (${it.hint})` : it.label} aria-label={it.label} aria-pressed={it.active}>
          <Icon name={it.icon} />
        </button>
      ))}
      <span className="spacer" />
      <button className="rail-btn" onClick={onShortcuts} title="Shortcuts" aria-label="Shortcuts"><Icon name="keyboard" /></button>
      <button className="rail-btn" onClick={onSettings} title={`Settings (${settingsLabel})`} aria-label="Settings"><Icon name="settings" /></button>
    </nav>
  );
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
  doc: "clean" | "dirty" | "saving" | "saved" | "conflict" | "error";
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
    return (
      <footer className="statusbar">
        <span>No workspace</span>
        <span className="right">
          <span>{words} words</span>
          <span>Ln {line}, Col {col}</span>
        </span>
      </footer>
    );
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
  const badSave = doc === "conflict" || doc === "error";
  const badConn = connection === "disconnected" || connection === "failed";
  return (
    <footer className="statusbar">
      <span className={`conn ${badConn ? "bad" : ""}`} title={`Workspace: ${workspace.displayName}`}>
        <i className="dot" />{seg.workspace} · {seg.platform} · {seg.connection}
      </span>
      <span role="status">
        {seg.save && (
          <span className={`savepill ${badSave ? "bad" : doc === "dirty" || doc === "saving" ? "dirty" : "saved"}`}>
            <i className="dot" />{seg.save}
          </span>
        )}
      </span>
      {indexWarning && (
        <span className="conn-bad" title={indexWarning} role="note">Index partial</span>
      )}
      {updateVersion && onReviewUpdate && (
        <button className="updbanner" onClick={onReviewUpdate} title="Review the available update">
          Update {updateVersion} available · Review
        </button>
      )}
      <span className="right">
        {onOpenHistory && (
          <button className="link" onClick={onOpenHistory} title="Open recovery history" aria-label="Open recovery history">History</button>
        )}
        <span>{words} {words === 1 ? "word" : "words"}</span>
        <span title="Notes in this workspace">{fileCount.toLocaleString()} notes</span>
      </span>
    </footer>
  );
}
