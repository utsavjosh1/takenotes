import { SAVE_STATES, type SaveState } from "@takenotes/core/save/decisions";
import type { WorkspaceKind } from "@takenotes/platform/types";

/** Status identity strip (P1-06): one line reading
 * `Workspace name · Windows|WSL [distro · user] · Saved|Dirty|Conflict ·
 * connection · index (n files)`. Pure formatter — no React — tested in
 * tests/renderer/status.test.ts. Distro/user come from explicit identity
 * fields (P1-03/P1-04), never parsed out of display text. Canonical product
 * terms only (CONTEXT.md: Workspace, Connection — never Vault). */
export type DocSaveView = "clean" | "error" | SaveState;

export type StatusInput = {
  displayName: string;
  kind: WorkspaceKind;
  /** Selected WSL identity (P1-03): explicit fields, never inferred. */
  distro?: string;
  linuxUser?: string;
  connection: "connected" | "disconnected" | "reconnecting" | "failed";
  doc: DocSaveView;
  savedAt?: string;
  /** Quick-open index size (allFiles). */
  fileCount: number;
};

export type StatusSegments = {
  workspace: string;
  platform: string;
  save: string;
  connection: string;
  files: string;
};

function platformLabel(kind: WorkspaceKind, distro?: string, linuxUser?: string): string {
  if (kind === "windows-wsl") {
    // `Ubuntu · work` — or equivalent when discovery hasn't filled a part.
    const parts = ["WSL", distro, linuxUser].filter((p) => p && p.length > 0);
    return parts.join(" · ");
  }
  if (kind === "macos-local") return "macOS";
  if (kind === "linux-local") return "Linux";
  return "Windows";
}

export function statusSegments(input: StatusInput): StatusSegments {
  // The seven honest states and their words come from the shared decision rules.
  let save = input.doc === "clean" || input.doc === "error" ? "" : SAVE_STATES[input.doc].label;
  if (input.doc === "error") save = "Error";
  if (input.doc === "saved" && input.savedAt) save = `Saved ${input.savedAt}`;
  let connection = "";
  switch (input.connection) {
    case "connected":
      connection = "Connected";
      break;
    case "disconnected":
      connection = "Unavailable";
      break;
    case "reconnecting":
      connection = "Reconnecting…";
      break;
    case "failed":
      connection = "Failed";
      break;
  }
  return {
    workspace: input.displayName,
    platform: platformLabel(input.kind, input.distro, input.linuxUser),
    save,
    connection,
    files: `${input.fileCount} file${input.fileCount === 1 ? "" : "s"}`,
  };
}
