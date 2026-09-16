/** Shared platform vocabulary. Single source of truth for OS identity. */

export type DesktopPlatform = "windows" | "macos" | "linux";

/** Node-style platform string this app knows how to classify. */
export type NodePlatform = "win32" | "darwin" | "linux" | (string & {});

/** Four workspace kinds (§11). The renderer only ever sees workspaceId +
 *  relativePath; the kind selects the main-process adapter. */
export type WorkspaceKind =
  | "windows-local"
  | "windows-wsl"
  | "macos-local"
  | "linux-local";

export type CommandScope =
  | "application"
  | "workspace"
  | "editor"
  | "fileTree"
  | "modal";
