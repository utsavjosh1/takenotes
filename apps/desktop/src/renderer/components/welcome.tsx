import type { JSX, ReactNode } from "react";
import { Button, EmptyState } from "@takenotes/ui/dom";
import type { RecentWorkspaceInfo } from "@takenotes/contracts/ipc";
import { Icon } from "./icons";
import lockupDarkUrl from "../assets/brand/takenotes-lockup-dark.svg";
import lockupLightUrl from "../assets/brand/takenotes-lockup-light.svg";

export type RecentServer = { address: string; name: string };
const SERVERS_KEY = "takenotes.recentServers";

export function readRecentServers(): RecentServer[] {
  try { return JSON.parse(localStorage.getItem(SERVERS_KEY) ?? "[]") as RecentServer[]; } catch { return []; }
}
export function rememberServer(address: string): RecentServer[] {
  const next = [{ address, name: new URL(address).host }, ...readRecentServers().filter((s) => s.address !== address)].slice(0, 5);
  try { localStorage.setItem(SERVERS_KEY, JSON.stringify(next)); } catch { /* recents are a convenience */ }
  return next;
}

export function kindLabel(type: string): string {
  return type === "windows-wsl" ? "WSL" : type === "macos-local" ? "macOS" : type === "linux-local" ? "Linux" : type === "server" ? "Server" : "Windows";
}

type RecentRow = { key: string; kind: string; name: string; path: string; open: () => void };

export function WelcomeScreen({ recents, servers, opening, wslEnabled, onOpenFolder, onOpenWsl, onCreate, onSignIn, onOpenRecent, onOpenServer, children }: {
  recents: Array<RecentWorkspaceInfo | { name: string; kind: string }>;
  servers: RecentServer[];
  opening: boolean;
  wslEnabled: boolean;
  onOpenFolder: () => void; onOpenWsl: () => void; onCreate: () => void; onSignIn: () => void;
  onOpenRecent: (id: string | undefined) => void;
  onOpenServer: (address: string) => void;
  children?: ReactNode;
}): JSX.Element {
  const rows: RecentRow[] = [
    ...recents.map((r, i): RecentRow => {
      const name = "displayName" in r ? r.displayName : r.name;
      const kind = "type" in r ? r.type : r.kind;
      const id = "id" in r ? r.id : undefined;
      return { key: id ?? `${name}-${i}`, kind: kindLabel(kind), name, path: "path" in r && r.path ? r.path : "", open: () => onOpenRecent(id) };
    }),
    ...servers.map((s): RecentRow => ({ key: s.address, kind: "Server", name: s.name, path: s.address, open: () => onOpenServer(s.address) })),
  ];
  return (
    <EmptyState className="welcome-state" headingLevel={1} title="Welcome to takenotes"
      illustration={<><img src={lockupDarkUrl} className="brand-logo only-dark" alt="" draggable={false} /><img src={lockupLightUrl} className="brand-logo only-light" alt="" draggable={false} /></>}
      actions={<div className="welcome-grid">
        <button className="wcard" onClick={onOpenFolder}><Icon name="folder" /><b>Open a folder</b><small>Use any folder of notes</small></button>
        {wslEnabled
          ? <button className="wcard" onClick={onOpenWsl}><Icon name="terminal" /><b>Open WSL folder</b><small>Your Linux home, edited from Windows</small></button>
          : <button className="wcard" disabled aria-disabled="true"><Icon name="terminal" /><b>Open WSL folder</b><small>Available on Windows</small></button>}
        <button className="wcard" onClick={onCreate}><Icon name="plus" /><b>Create a workspace</b><small>Start empty with a welcome note</small></button>
        <button className="wcard" onClick={onSignIn}><Icon name="cloud" /><b>Sign in to a server</b><small>Your self-hosted takenotes</small></button>
      </div>}>
      {children}
      <p className="supporting-copy">Your notes stay plain text files you own.</p>
      {opening && (
        <div className="ws-skeleton" role="status" aria-label="Opening workspace">
          <span className="sk" /><span className="sk" /><span className="sk short" />
        </div>
      )}
      {rows.length > 0 && (
        <>
          <hr className="sect-sep" />
          <div className="recent-list">
            <div className="panel-title" style={{ paddingLeft: 12 }}>Recent</div>
            {rows.map((r) => (
              <button key={r.key} className="recent-item" onClick={r.open} disabled={opening}>
                <span className={`kind kind-${r.kind.toLowerCase()}`}>{r.kind}</span>
                <span className="n">{r.name}</span>
                {r.path && <span className="d">{r.path}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </EmptyState>
  );
}

export function NoNotesState({ onNew }: { onNew: () => void }): JSX.Element {
  return (
    <div className="pane-empty-note">
      <p><b>No notes yet</b></p>
      <p className="muted">Notes you add to this folder show up here.</p>
      <Button variant="primary" onClick={onNew}>New note</Button>
    </div>
  );
}
