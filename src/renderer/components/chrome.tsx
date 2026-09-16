import type { JSX } from "react";
import { Icon } from "./icons";
import type { WorkspaceInfo } from "../../shared/contracts/ipc";
import { isWslKind } from "../../shared/platform/filesystem";
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
  const quickOpen = platform.shortcutLabel("file.quickOpen");
  return (
    <header className="titlebar" role="banner">
      <span className="ws-name" title={workspace ? workspace.displayName : "Desktop Notes"}>
        {workspace ? workspace.displayName : "Desktop Notes"}
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
  const searchLabel = platform.shortcutLabel("workspace.search");
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
export function StatusBar({
  workspace,
  words,
  line,
  col,
  saveState,
}: {
  workspace: WorkspaceInfo | null;
  words: number;
  line: number;
  col: number;
  saveState: string;
}): JSX.Element {
  const conn = workspace
    ? isWslKind(workspace.type)
      ? `${workspace.displayName.split(":")[0]} · WSL`
      : workspace.displayName
    : "No workspace";
  return (
    <footer className="statusbar" role="status" aria-live="polite">
      <span className={workspace ? "conn-ok" : ""} title={workspace ? `Workspace: ${workspace.displayName}` : undefined}>
        {conn}
      </span>
      <span className="right">
        {saveState !== "clean" && (
          <span className={saveState === "conflict" || saveState === "error" ? "conn-bad" : "save-dot"}>
            {saveState === "dirty" ? "● Unsaved" : saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState}
          </span>
        )}
        <span>{words} words</span>
        <span>Ln {line}, Col {col}</span>
      </span>
    </footer>
  );
}
