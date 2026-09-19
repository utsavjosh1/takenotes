import type { JSX } from "react";
import { Icon } from "./icons";
import appMarkUrl from "../assets/brand/takenotes-app-icon.svg";
import type { WorkspaceInfo } from "../../shared/contracts/ipc";
import { isWslKind } from "../../shared/platform/filesystem";
import { statusSegments } from "../status";
import type { PlatformState } from "../hooks/use-platform";

/* ---------- title bar ---------- */
export function TitleBar({
  workspace,
  platform,
  onQuickOpen,
  onOpenWindows,
  onOpenWsl,
}: {
  workspace: WorkspaceInfo | null;
  platform: PlatformState;
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
        title={`Quick open (${quickOpen})`}
        aria-label="Quick open notes"
      >
        <span>Search notes…</span>
        <kbd>{quickOpen}</kbd>
      </button>
      {!workspace && (
        <span style={{ display: "flex", gap: 8, WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <button className="btn" onClick={onOpenWindows}>Open folder</button>
          {platform.capabilities.wsl && (
            <button className="btn" onClick={onOpenWsl}>Open WSL folder</button>
          )}
        </span>
      )}
    </header>
  );
}

/* ---------- activity rail ---------- */
export function ActivityRail({
  view,
  platform,
  onView,
  onSettings,
}: {
  view: "files" | "search";
  platform: PlatformState;
  onView: (v: "files" | "search") => void;
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
}: {
  workspace: WorkspaceInfo | null;
  words: number;
  line: number;
  col: number;
  doc: "clean" | "dirty" | "saving" | "saved" | "conflict" | "error";
  savedAt: string;
  connection: "connected" | "disconnected" | "reconnecting" | "failed";
  fileCount: number;
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
      <span className="right">
        <span>{words} words</span>
        <span>Ln {line}, Col {col}</span>
      </span>
    </footer>
  );
}
