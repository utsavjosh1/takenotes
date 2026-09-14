import type { AppError } from "../errors.js";

export type WorkspaceType = "windows" | "wsl";

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

export type SearchMatch = {
  relativePath: string;
  line: number;
  column: number;
  preview: string;
};
