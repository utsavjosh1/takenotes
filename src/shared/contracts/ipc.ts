import type { AppError } from "../errors.js";
import type { WorkspaceKind } from "../platform/types.js";

/** Workspace kinds (§11). Legacy `"windows"` means `"windows-local"` and
 *  legacy `"wsl"` means `"windows-wsl"` at the IPC boundary. */
export type WorkspaceType = WorkspaceKind;

export type WorkspaceInfo = {
  workspaceId: string;
  displayName: string;
  type: WorkspaceType;
  connection: "connected" | "disconnected" | "reconnecting" | "failed";
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
  state?: string;
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
