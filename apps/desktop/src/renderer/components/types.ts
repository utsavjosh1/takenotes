import type { DirectoryEntry, WorkspaceInfo } from "@takenotes/contracts/ipc";
import type { LinkFormat } from "@takenotes/core/links/completion";

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
  /** In-flight save (per-document, P1-06): the status strip derives
   * Saving… from the active document, never from a global flag. */
  saving: boolean;
  /** Last successful save time for the `Saved …` status segment. */
  savedAt: string;
  /** Pinned tabs stay visually marked and are future-proof for tab ordering. */
  pinned?: boolean;
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
  /** Live preview: render markdown in place, cursor line shows source. Off = plain source. */
  livePreview: boolean;
  /** `[[` insertion style. Shortest is the default. */
  linkFormat: LinkFormat;
  /** Write new links as `[[wikilinks]]`. Off writes `[label](path.md)`
   * Markdown links instead (file links only — `#heading`/`#^block`
   * refinements stay `[[…]]`). Reading/following either form always works. */
  useWikilinks: boolean;
  /** Rewrite `[[links]]` after renames. Off prompts for rename-only. */
  autoUpdateLinks: boolean;
  confirmTrash: boolean;
  /** Step 9: accent family for links/focus/selection. */
  accent: "violet" | "blue" | "graphite";
  /** Step 9: editor body face (UI chrome stays OS-native system sans). */
  editorFont: "system" | "serif" | "mono";
  /** Step 9: whole-app zoom factor (View → Zoom In/Out/Actual Size). */
  zoomLevel: number;
  /** Step 9: inline note-title row above the editor. */
  inlineTitle: boolean;
  /** Step 9: window frame (`native` = OS title bar everywhere, restart to apply). */
  frameStyle: "auto" | "native";
  /** Opt-in WSL workspaces. Gated on platform WSL support; off → plain notetaking app. */
  wslEnabled: boolean;
  /** Step 2: activity-rail visibility. Off hides the ribbon; palette stays available. */
  ribbonVisible: boolean;
  /** Folder of `.md` template notes, relative to the workspace root. */
  templateFolder: string;
  /** Where the New-task command appends: today's Daily Note or Inbox.md. */
  taskCaptureTarget: "daily" | "inbox";
  /** Default location for imported attachments: workspace root, the
   * note's folder, a subfolder under it, or the configured folder. */
  attachmentLocation: "root" | "same-folder" | "subfolder" | "folder";
  /** Folder for `folder` mode (root-relative) and the subfolder name for
   * `subfolder` mode. Defaults to `attachments`. */
  attachmentFolder: string;
  /** Unsupported file kinds: import + link them, or skip with a toast. */
  attachmentUnsupported: "link" | "skip";
};

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  fontSize: 16,
  lineHeight: 1.625,
  readableWidth: 760,
  fullWidth: false,
  wordWrap: true,
  lineNumbers: false,
  livePreview: true,
  linkFormat: "shortest",
  useWikilinks: true,
  autoUpdateLinks: true,
  confirmTrash: false,
  accent: "violet",
  editorFont: "system",
  zoomLevel: 1,
  inlineTitle: true,
  frameStyle: "auto",
  wslEnabled: false,
  ribbonVisible: true,
  templateFolder: "Templates",
  taskCaptureTarget: "daily",
  attachmentLocation: "subfolder",
  attachmentFolder: "attachments",
  attachmentUnsupported: "link",
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
