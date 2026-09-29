import type { JSX } from "react";
import { Button } from "@takenotes/ui/dom";
import { Icon } from "./icons";
import appMarkUrl from "../assets/brand/takenotes-symbol-violet.svg";
import type { WorkspaceInfo } from "@takenotes/contracts/ipc";
import { isWslKind } from "@takenotes/platform/filesystem";
import { statusSegments } from "../status";
import type { PlatformState } from "../hooks/use-platform";

/* ---------- title bar ---------- */
export function TitleBar({
  workspace,
  platform,
  wslEnabled,
  onQuickOpen,
  onOpenWindows,
  onOpenWsl,
}: {
  workspace: WorkspaceInfo | null;
  platform: PlatformState;
  /** Settings opt-in: WSL entry points render only when true (and supported). */
  wslEnabled: boolean;
  onQuickOpen: () => void;
  onOpenWindows: () => void;
  onOpenWsl: () => void;
}): JSX.Element {
  const quickOpen = platform.shortcutLabel("quickOpen.open");
  return (
    <header className="titlebar" role="banner">
      <img src={appMarkUrl} className="app-mark" alt="" aria-hidden="true" draggable={false} />
      <span className="ws-name" title={workspace ? workspace.displayName : "takenotes"}>
        {workspace ? workspace.displayName : "takenotes"}
      </span>
      {workspace && isWslKind(workspace.type) && (
        <span className="wsl-badge" title="WSL workspace">
          <Icon name="terminal" />
          WSL
        </span>
      )}
      <button
        className="quickopen-launcher"
        onClick={onQuickOpen}
        title={workspace ? `Quick open (${quickOpen})` : "Open a workspace before using quick open"}
        aria-label={workspace ? "Quick open notes" : "Quick open unavailable until a workspace is open"}
        disabled={!workspace}
      >
        <span>Quick open…</span>
        <kbd>{quickOpen}</kbd>
      </button>
      {!workspace && (
        <span style={{ display: "flex", gap: 8, WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <Button onClick={onOpenWindows}>Open folder</Button>
          {platform.capabilities.wsl && wslEnabled && (
            <Button onClick={onOpenWsl}>Open WSL folder</Button>
          )}
        </span>
      )}
    </header>
  );
}

/* ---------- activity rail ---------- */
/** Step 2 shell seam: fixed-order left panes. Right sidebar is an empty
 * slot until Steps 3/4/6 fill it; pane drag-reorder deferred. */
export const SIDEBAR_VIEWS = ["files", "search", "outline", "favorites"] as const;
export type SidebarView = (typeof SIDEBAR_VIEWS)[number];

export function ActivityRail({
  view,
  platform,
  onView,
  onSettings,
}: {
  view: SidebarView;
  platform: PlatformState;
  onView: (v: SidebarView) => void;
  onSettings: () => void;
}): JSX.Element {
  const searchLabel = platform.shortcutLabel("search.open");
  const settingsLabel = platform.shortcutLabel("settings.open");
  return (
    <nav className="rail" aria-label="Activity">
      <button
        className={`rail-btn${view === "files" ? " active" : ""}`}
        onClick={() => onView("files")}
        title="Files"
        aria-label="Files"
        aria-pressed={view === "files"}
      >
        <Icon name="files" />
      </button>
      <button
        className={`rail-btn${view === "search" ? " active" : ""}`}
        onClick={() => onView("search")}
        title={`Search (${searchLabel})`}
        aria-label="Search"
        aria-pressed={view === "search"}
      >
        <Icon name="search" />
      </button>
      <button
        className={`rail-btn${view === "outline" ? " active" : ""}`}
        onClick={() => onView("outline")}
        title="Outline"
        aria-label="Outline"
        aria-pressed={view === "outline"}
      >
        <Icon name="list" />
      </button>
      <button
        className={`rail-btn${view === "favorites" ? " active" : ""}`}
        onClick={() => onView("favorites")}
        title="Favorites"
        aria-label="Favorites"
        aria-pressed={view === "favorites"}
      >
        <Icon name="star" />
      </button>
      <span className="spacer" />
      <button className="rail-btn" onClick={onSettings} title={`Settings (${settingsLabel})`} aria-label="Settings">
        <Icon name="settings" />
      </button>
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
}): JSX.Element {
  if (!workspace) {
    return (
      <footer className="statusbar" role="status" aria-live="polite">
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
    <footer className="statusbar" role="status" aria-live="polite">
      <span className="conn-ok" title={`Workspace: ${workspace.displayName}`}>{seg.workspace}</span>
      <span title={isWslKind(workspace.type) ? "WSL connection identity" : "Platform"}>{seg.platform}</span>
      {seg.save && (
        <span className={badSave ? "conn-bad" : "save-dot"}>
          {doc === "dirty" ? `● ${seg.save}` : seg.save}
        </span>
      )}
      <span className={badConn ? "conn-bad" : "conn-ok"}>{seg.connection}</span>
      <span title="Notes in the Quick-open index">{seg.files}</span>
      {indexWarning && (
        <span className="conn-bad" title={indexWarning} role="note">Index partial</span>
      )}
      <span className="right">
        {onOpenHistory && (
          <button className="link" onClick={onOpenHistory} title="Open recovery history" aria-label="Open recovery history">History</button>
        )}
        <span>{words} words</span>
        <span>Ln {line}, Col {col}</span>
      </span>
    </footer>
  );
}
