import type { AppError } from "../errors.js";
import type { CommandDefinition } from "../commands/registry.js";
import type { WorkspaceKind } from "../platform/types.js";

/** Workspace kinds (§11). Legacy `"windows"` means `"windows-local"` and
 *  legacy `"wsl"` means `"windows-wsl"` at the IPC boundary. */
export type WorkspaceType = WorkspaceKind;

export type WorkspaceInfo = {
  workspaceId: string;
  displayName: string;
  type: WorkspaceType;
  connection: "connected" | "disconnected" | "reconnecting" | "failed";
  /** WSL distro (P1-06): explicit identity for the status strip — the
   * renderer never parses it out of display text. */
  distro?: string;
  /** WSL Linux user (P1-03). Never a raw root — main resolves those. */
  linuxUser?: string;
};

export type DirectoryEntry = {
  name: string;
  relativePath: string;
  kind: "file" | "directory";
  /** MVP classification for editor decisions. */
  fileClass: "markdown" | "text" | "image" | "other";
  size: number;
  mtimeMs: number;
};

export type FileRevision = {
  hash: string;
  size: number;
  mtimeMs: number;
};

export type FileReadResult = {
  content: string;
  revision: FileRevision;
  newlineStyle: "lf" | "crlf";
  hadBom: boolean;
};

export type IpcResult<T> = { ok: true; result: T } | { ok: false; error: AppError };

export type WslDistribution = {
  name: string;
  /** Running|Stopped… — absent on the quiet fallback path (names only). */
  state?: string;
  /** WSL version ("2"…); absent on the quiet fallback path. */
  version?: string;
  /** True for the `*` default distro in `wsl -l -v`. */
  isDefault?: boolean;
};

/** Structured Linux-user record (helper `users.list`, `/etc/passwd`-backed).
 * The renderer receives these only — it never parses passwd itself and
 * never gains shell execution. */
export type WslLinuxUser = {
  username: string;
  uid: number;
  gid?: number;
  home: string;
  shell?: string;
  /** True for the user the discovery helper ran as (distro default user).
   * The picker offers it as the preselected "Default" row. */
  isDefault?: boolean;
};

export type UpdateCheckResult = {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string | null;
  releaseNotes: string | null;
};

export type UpdateProgress = {
  phase: "downloading" | "verifying" | "launching";
  receivedBytes: number;
  totalBytes: number | null;
};

export type SearchMatch = {
  relativePath: string;
  line: number;
  column: number;
  preview: string;
};

export type CommandListResult = CommandDefinition[];

export type PlatformReport = {
  platform: "windows" | "macos" | "linux";
  arch: string;
  capabilities: {
    wsl: boolean;
    updates: boolean;
    macTrafficLights: boolean;
    supportsWayland: boolean;
  };
  workspaceKind: WorkspaceType;
  wayland: boolean;
  shortcuts: Record<string, string>;
};
