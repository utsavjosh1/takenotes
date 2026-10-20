/**
 * M2 — Editor session (pure save-pipeline state machine).
 *
 * Desktop contract, mobile logic: debounced autosave + explicit save, dirty
 * tracking, `CONFLICT` banner keeps both versions safe (Reload-keeps-disk /
 * Retry-save), draft-retained flow when the file vanished. No timers inside —
 * the caller passes `now` (fake clock in tests, `Date.now` on device) and
 * schedules its own debounce around `autosaveDue`.
 *
 * States: `clean` → `dirty` → `saving` → `clean` | `conflict` | `missing`.
 * `conflict` and `missing` retain the draft (never silently dropped).
 */

import type { AppError } from "@takenotes/contracts/errors";
import type { FileRevision } from "@takenotes/contracts/ipc";

export type SaveFn = (
  content: string,
  expected: { hash: string; newlineStyle: "lf" | "crlf"; hadBom: boolean },
) => Promise<{ revision: FileRevision } | { error: AppError }>;

export type SessionState = "clean" | "dirty" | "saving" | "conflict" | "missing";

export type SessionSnapshot = {
  state: SessionState;
  draft: string;
  dirty: boolean;
};

export class EditorSession {
  private state: SessionState = "clean";
  private draft: string;
  private expected: { hash: string; newlineStyle: "lf" | "crlf"; hadBom: boolean };
  private lastTypeMs: number;
  private diskContent: string | null = null;

  constructor(
    initial: { content: string; hash: string; newlineStyle: "lf" | "crlf"; hadBom: boolean; now: number },
    private readonly save: SaveFn,
    private readonly autosaveDebounceMs = 1500,
  ) {
    this.draft = initial.content;
    this.expected = { hash: initial.hash, newlineStyle: initial.newlineStyle, hadBom: initial.hadBom };
    this.lastTypeMs = initial.now;
  }

  view(): SessionSnapshot {
    return { state: this.state, draft: this.draft, dirty: this.state === "dirty" || this.state === "saving" };
  }

  /** Keystroke: draft moves, state goes dirty (conflict/missing keep priority). */
  type(content: string, now: number): void {
    this.draft = content;
    this.lastTypeMs = now;
    if (this.state === "clean") this.state = "dirty";
    else if (this.state === "saving") this.state = "dirty";
  }

  /** True when dirty, idle past the debounce, and not already saving. */
  autosaveDue(now: number): boolean {
    return this.state === "dirty" && now - this.lastTypeMs >= this.autosaveDebounceMs;
  }

  /** Explicit save (Ctrl+S / save button) — fires even inside the debounce. */
  async saveExplicit(): Promise<void> {
    await this.doSave();
  }

  /** Debounced autosave — no-op unless `autosaveDue(now)`. */
  async autosave(now: number): Promise<void> {
    if (!this.autosaveDue(now)) return;
    await this.doSave();
  }

  private async doSave(): Promise<void> {
    if (this.state === "saving") return;
    const prev = this.state;
    this.state = "saving";
    const sent = this.draft;
    const out = await this.save(sent, this.expected);
    if ("revision" in out) {
      this.expected = { ...this.expected, hash: out.revision.hash };
      this.state = this.draft === sent ? "clean" : "dirty";
      this.diskContent = null;
    } else if (out.error.code === "CONFLICT") {
      this.state = "conflict";
    } else if (out.error.code === "NOT_FOUND") {
      this.state = "missing";
    } else {
      this.state = prev;
      throw new Error(`save failed: ${out.error.code}`);
    }
  }

  /** Reload-keeps-disk: draft resets to disk, expected advances, clean. */
  reload(disk: { content: string; hash: string; newlineStyle: "lf" | "crlf"; hadBom: boolean }): void {
    this.draft = disk.content;
    this.expected = { hash: disk.hash, newlineStyle: disk.newlineStyle, hadBom: disk.hadBom };
    this.diskContent = null;
    this.state = "clean";
  }

  /** Retry-save: re-attempt with the same expected revision (succeeds only
   *  if disk came back to it). Stays in conflict on repeat CONFLICT. */
  async retry(): Promise<void> {
    if (this.state !== "conflict" && this.state !== "missing") return;
    const prev = this.state;
    this.state = "saving";
    const sent = this.draft;
    const out = await this.save(sent, this.expected);
    if ("revision" in out) {
      this.expected = { ...this.expected, hash: out.revision.hash };
      this.state = this.draft === sent ? "clean" : "dirty";
    } else if (out.error.code === "CONFLICT" || out.error.code === "NOT_FOUND") {
      this.state = prev;
    } else {
      this.state = prev;
      throw new Error(`retry failed: ${out.error.code}`);
    }
  }

  /** Disk bytes captured at CONFLICT time (banner "keep both versions safe"). */
  get conflictSnapshot(): string | null {
    return this.diskContent;
  }

  setConflictSnapshot(content: string): void {
    this.diskContent = content;
  }
}
