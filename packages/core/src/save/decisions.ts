/** Pure rules behind the trust layer: what to do when a file changes, fails to save, or is compared. No React, no disk. */

export type DiskState = { exists: boolean; rev?: string };
export type DocFlags = { dirty: boolean; baseRev: string };

export type ExternalAction =
  /** The file on disk is what this note already holds (our own write echoing back). */
  | { kind: "ignore" }
  /** Nothing unsaved here: take the new text quietly and say "Updated from disk." */
  | { kind: "reload-quietly" }
  /** Unsaved edits and a changed file: never merge, never overwrite. Show the banner. */
  | { kind: "conflict" }
  /** The file is gone. Unsaved edits are kept and offered back. */
  | { kind: "deleted"; keepEdits: boolean };

export function decideExternalChange(doc: DocFlags, disk: DiskState): ExternalAction {
  if (!disk.exists) return { kind: "deleted", keepEdits: doc.dirty };
  if (disk.rev === doc.baseRev) return { kind: "ignore" };
  return doc.dirty ? { kind: "conflict" } : { kind: "reload-quietly" };
}

export type SaveFailure = "conflict" | "readonly" | "offline" | "deleted" | "other";

/** Maps a failed write to the state the person sees. Accepts app and FileStore error codes. */
export function classifySaveFailure(code: string): SaveFailure {
  switch (code) {
    case "CONFLICT": return "conflict";
    case "PERMISSION_DENIED": case "EACCES": return "readonly";
    case "DISCONNECTED": case "OFFLINE": return "offline";
    case "NOT_FOUND": case "ENOENT": return "deleted";
    default: return "other";
  }
}

export type SaveState = "saved" | "saving" | "unsaved" | "conflict" | "readonly" | "deleted" | "disconnected";

export const SAVE_STATES: Record<SaveState, { label: string; tip: string }> = {
  saved: { label: "Saved", tip: "Everything you wrote is saved to the file." },
  saving: { label: "Saving…", tip: "Saving your changes now." },
  unsaved: { label: "Unsaved changes", tip: "Your changes save by themselves, or press Ctrl+S to save now." },
  conflict: { label: "Changed elsewhere", tip: "This note was changed somewhere else. Nothing is saved until you choose." },
  readonly: { label: "Read-only", tip: "This note can’t be changed here. Copy it to a new note to keep your edits." },
  deleted: { label: "Deleted", tip: "This note was deleted outside takenotes. Your text is still here." },
  disconnected: { label: "Disconnected", tip: "The connection is down. Keep writing; changes save when it comes back." },
};

/** One honest state for the status bar. The most serious one wins. */
export function saveStateOf(d: { dirty: boolean; saving: boolean; conflict: boolean; readOnly?: boolean; deleted?: boolean; offline?: boolean }): SaveState {
  if (d.deleted) return "deleted";
  if (d.conflict) return "conflict";
  if (d.readOnly) return "readonly";
  if (d.offline) return "disconnected";
  if (d.saving) return "saving";
  if (d.dirty) return "unsaved";
  return "saved";
}

export type SnapshotReason = "edit" | "save" | "close" | "shutdown" | "restore-before" | "before-overwrite" | "before-reload" | "before-agent-undo";

export function snapshotLabel(reason: string): string {
  switch (reason) {
    case "before-overwrite": return "Before overwrite";
    case "before-reload": return "Before reload";
    case "restore-before": return "Before restore";
    case "before-agent-undo": return "Before agent undo";
    case "close": return "On close";
    default: return "Auto";
  }
}

/* ---------- comparing two versions ---------- */

export type DiffKind = "same" | "add" | "del";
export type DiffRow = { left: { text: string; kind: "same" | "del" } | null; right: { text: string; kind: "same" | "add" } | null };

/** Line diff of "mine" against "the other one", laid out side by side. Removed lines show red on the left, added lines green on the right. */
export function sideBySide(mine: string, theirs: string): DiffRow[] {
  const a = mine.split("\n");
  const b = theirs.split("\n");
  const n = a.length, m = b.length;
  // Longest common subsequence over lines; capped so a huge note can't stall the dialog.
  if (n * m > 4_000_000) return [{ left: { text: "(too large to compare line by line)", kind: "del" }, right: null }];
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const rows: DiffRow[] = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { rows.push({ left: { text: a[i]!, kind: "same" }, right: { text: b[j]!, kind: "same" } }); i++; j++; }
    else if (i < n && (j >= m || lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) { rows.push({ left: { text: a[i]!, kind: "del" }, right: null }); i++; }
    else { rows.push({ left: null, right: { text: b[j]!, kind: "add" } }); j++; }
  }
  return rows;
}

/** Number of lines in a note (shown in the history list). */
export function lineCount(text: string): number {
  return text === "" ? 0 : text.split("\n").length;
}
