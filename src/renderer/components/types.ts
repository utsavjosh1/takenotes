import type { DirectoryEntry, WorkspaceInfo } from "../../shared/contracts/ipc";

export type TabState = {
  key: string;
  relativePath: string;
  content: string;
  dirty: boolean;
  revisionHash: string;
  newlineStyle: "lf" | "crlf";
  hadBom: boolean;
  conflict: boolean;
  loadError: string | null;
};

export type Toast = { id: number; kind: "info" | "error"; text: string };
export type CtxMenu = {
  x: number;
  y: number;
  items: { label: string; shortcut?: string; danger?: boolean; disabled?: boolean; run: () => void }[];
} | null;

export type Settings = {
  theme: "system" | "light" | "dark";
  fontSize: number;
  lineHeight: number;
  readableWidth: number;
  fullWidth: boolean;
  wordWrap: boolean;
  lineNumbers: boolean;
  confirmTrash: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  fontSize: 16,
  lineHeight: 1.625,
  readableWidth: 760,
  fullWidth: false,
  wordWrap: true,
  lineNumbers: false,
  confirmTrash: false,
};

export type AppSnapshot = {
  workspace: WorkspaceInfo | null;
  entries: DirectoryEntry[];
};

export function displayPath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/");
}

export function fileName(relativePath: string): string {
  const p = displayPath(relativePath);
  return p.slice(p.lastIndexOf("/") + 1);
}

export function parentDir(relativePath: string): string {
  const p = displayPath(relativePath);
  const i = p.lastIndexOf("/");
  return i < 0 ? "" : p.slice(0, i);
}

/** Join a directory and a child name in canonical `/` form (§filesystem). */
export function joinRel(dir: string, name: string): string {
  return dir ? `${displayPath(dir)}/${name}` : name;
}
