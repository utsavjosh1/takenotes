import { isValidDistroId, isValidLinuxUser } from "./launch-security.js";

/** Explicit Connection record (ADR-0007): how we reach Linux —
 * distro + Linux user + status — distinct from a Workspace (connection +
 * rootPath + settings + grants). One connection exposes many workspaces:
 * the store holds the record, workspaces attach/detach by id, and closing
 * the last workspace never deletes the record (status persists). */
export type WslConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "failed"
  | "incompatible";

export type WslConnection = {
  /** Stable key `${distro}\0${linuxUser}` — also the registry `connectionId`. */
  id: string;
  distro: string;
  linuxUser: string;
  status: WslConnectionStatus;
};

/** Allowed status edges. Reconnect replaces the singleton session without
 * an intermediate disconnect event, so `connected → connecting` is legal;
 * anything outside this matrix is rejected (the record keeps its status). */
const TRANSITIONS: Record<WslConnectionStatus, readonly WslConnectionStatus[]> = {
  connecting: ["connected", "disconnected", "failed", "incompatible"],
  connected: ["connecting", "disconnected", "reconnecting", "incompatible"],
  disconnected: ["connecting"],
  reconnecting: ["connecting", "connected", "disconnected", "failed", "incompatible"],
  failed: ["connecting", "disconnected"],
  incompatible: ["connecting", "disconnected"],
};

/** Stable connection key. Throws on hostile distro/user values before
 * anything reaches spawn or the registry — same argv discipline as
 * `buildWslHelperArgv`. Names with spaces are valid; slashes, NUL, and
 * (for users) whitespace are not. */
export function connectionKeyFor(distro: unknown, linuxUser: unknown): string {
  if (!isValidDistroId(distro) || !isValidLinuxUser(linuxUser)) {
    throw new Error("Invalid WSL connection identity.");
  }
  return `${distro as string}\0${linuxUser as string}`;
}

/** Map supervisor states onto connection status for the store.
 * `starting`/`handshake` are both `connecting` — the renderer never sees
 * supervisor internals. Covers both the helper supervisor (`handshake`,
 * `incompatible`) and the runtime supervisor (`failed`). */
export function connectionStatusForHelperState(
  state: "starting" | "handshake" | "connected" | "disconnected" | "incompatible" | "failed",
): WslConnectionStatus {
  switch (state) {
    case "starting":
    case "handshake":
      return "connecting";
    case "connected":
      return "connected";
    case "disconnected":
      return "disconnected";
    case "incompatible":
      return "incompatible";
    case "failed":
      return "failed";
  }
}

/** Project connection status onto the renderer-facing
 * `WorkspaceInfo.connection` union. `connecting` surfaces as
 * `reconnecting` (transient, never failed); `incompatible` is `failed`
 * with detail available in main diagnostics. */
export function workspaceConnectionFor(
  status: WslConnectionStatus,
): "connected" | "disconnected" | "reconnecting" | "failed" {
  switch (status) {
    case "connected":
      return "connected";
    case "connecting":
    case "reconnecting":
      return "reconnecting";
    case "disconnected":
      return "disconnected";
    case "failed":
    case "incompatible":
      return "failed";
  }
}

type StoredConnection = { distro: string; linuxUser: string; status: WslConnectionStatus; workspaceIds: Set<string> };

/** Owns connection records keyed by `connectionKeyFor`. Pure — no spawn,
 * no IPC — so tests drive the full lifecycle without `wsl.exe`. */
export class ConnectionStore {
  private readonly records = new Map<string, StoredConnection>();

  /** Ensure the record exists (created `disconnected`) and move it to
   * `connecting`. Returns the key. Idempotent for repeated connects. */
  markConnecting(distro: string, linuxUser: string): string {
    const key = connectionKeyFor(distro, linuxUser);
    let rec = this.records.get(key);
    if (!rec) {
      rec = { distro, linuxUser, status: "disconnected", workspaceIds: new Set() };
      this.records.set(key, rec);
    }
    this.apply(rec, "connecting");
    return key;
  }

  /** Set status by key. Unknown keys are ignored (false); illegal edges
   * are rejected without mutating (false). Never throws — supervisor
   * state callbacks must not break the transport. */
  setStatusByKey(key: string, next: WslConnectionStatus): boolean {
    const rec = this.records.get(key);
    if (!rec) return false;
    return this.apply(rec, next);
  }

  setStatus(distro: string, linuxUser: string, next: WslConnectionStatus): boolean {
    let key: string;
    try {
      key = connectionKeyFor(distro, linuxUser);
    } catch {
      return false;
    }
    return this.setStatusByKey(key, next);
  }

  markConnected(distro: string, linuxUser: string): boolean {
    return this.setStatus(distro, linuxUser, "connected");
  }

  markFailed(distro: string, linuxUser: string): boolean {
    return this.setStatus(distro, linuxUser, "failed");
  }

  markDisconnected(distro: string, linuxUser: string): boolean {
    return this.setStatus(distro, linuxUser, "disconnected");
  }

  /** Attach an opened workspace to its connection. Creates the record
   * (`disconnected`) when the workspace arrives without a prior connect
   * mark — the record is never the reason an open fails. */
  attachWorkspace(distro: string, linuxUser: string, workspaceId: string): string {
    const key = connectionKeyFor(distro, linuxUser);
    let rec = this.records.get(key);
    if (!rec) {
      rec = { distro, linuxUser, status: "disconnected", workspaceIds: new Set() };
      this.records.set(key, rec);
    }
    rec.workspaceIds.add(workspaceId);
    return key;
  }

  /** Detach a closing workspace. The record (and its status) persists —
   * closing the last workspace never deletes the connection. Returns the
   * connection key, or null when the workspace was not attached. */
  detachWorkspace(workspaceId: string): string | null {
    for (const [key, rec] of this.records) {
      if (rec.workspaceIds.delete(workspaceId)) return key;
    }
    return null;
  }

  get(distro: string, linuxUser: string): WslConnection | undefined {
    let key: string;
    try {
      key = connectionKeyFor(distro, linuxUser);
    } catch {
      return undefined;
    }
    return this.project(key, this.records.get(key));
  }

  getByKey(key: string): WslConnection | undefined {
    return this.project(key, this.records.get(key));
  }

  getForWorkspace(workspaceId: string): WslConnection | undefined {
    for (const [key, rec] of this.records) {
      if (rec.workspaceIds.has(workspaceId)) return this.project(key, rec);
    }
    return undefined;
  }

  list(): WslConnection[] {
    const out: WslConnection[] = [];
    for (const [key, rec] of this.records) {
      const p = this.project(key, rec);
      if (p) out.push(p);
    }
    return out;
  }

  private apply(rec: StoredConnection, next: WslConnectionStatus): boolean {
    if (rec.status === next) return true;
    if (!TRANSITIONS[rec.status].includes(next)) return false;
    rec.status = next;
    return true;
  }

  private project(key: string, rec: StoredConnection | undefined): WslConnection | undefined {
    if (!rec) return undefined;
    return { id: key, distro: rec.distro, linuxUser: rec.linuxUser, status: rec.status };
  }
}
