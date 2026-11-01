import { useState, type JSX } from "react";
import { Button, Dialog, Input } from "@takenotes/ui/dom";
import { formatTaskLine } from "@takenotes/core/productivity/tasks";
import type { TaskCaptureTarget } from "@takenotes/core/productivity/tasks";

export type CaptureKind = "task" | "bullet" | "note";
export type NewTaskInput = { text: string; due?: string; /** `YYYY-MM-DD` or `YYYY-MM-DD HH:MM`, written as @scheduled(...). */ scheduled?: string; target?: TaskCaptureTarget; kind?: CaptureKind };
type Dest = "inbox" | "daily" | "task" | "note";

/** New-task dialog (productivity step 2): text plus an optional explicit
 * `YYYY-MM-DD` due date. No natural-language parsing — an invalid date is
 * an inline error, never a guess. */
export function TaskDialog({ target, onSubmit, onClose }: {
  target: TaskCaptureTarget;
  onSubmit: (input: NewTaskInput) => void;
  onClose: () => void;
}): JSX.Element {
  const [dest, setDest] = useState<Dest>(target);
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = (): void => {
    if (!text.trim()) { setError("Nothing to save yet."); return; }
    if (dest === "task") {
      try {
        formatTaskLine(text, due.trim() ? due : undefined);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invalid task.");
        return;
      }
      onSubmit({ text: text.trim(), due: due.trim() ? due.trim() : undefined, target, kind: "task" });
    } else if (dest === "note") {
      onSubmit({ text: text.trim(), kind: "note" });
    } else {
      onSubmit({ text: text.trim(), target: dest, kind: "bullet" });
    }
  };
  return (
    <Dialog
      title="Quick capture"
      onClose={onClose}
      closeOnBackdrop
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Save</Button></>}
    >
      <div className="task-dialog">
        <div className="dest" role="group" aria-label="Capture destination">
          {([["inbox", "Inbox"], ["daily", "Daily"], ["task", "Task"], ["note", "New note"]] as const).map(([k, label]) => (
            <button key={k} type="button" className={dest === k ? "on" : ""} aria-pressed={dest === k} onClick={() => setDest(k)}>{label}</button>
          ))}
        </div>
        <Input
          className="cmd-input"
          autoFocus
          aria-label="Capture text"
          placeholder="Capture something…"
          value={text}
          onChange={(e) => { setText(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
        />
        {dest === "task" && (
          <Input
            className="cmd-input"
            aria-label="Due date (optional)"
            placeholder="Due YYYY-MM-DD (optional)"
            value={due}
            onChange={(e) => { setDue(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
          />
        )}
        <div className="list-section">
          {dest === "daily" ? "Adds a bullet to today's Daily Note (never created silently)."
            : dest === "task" ? (target === "daily" ? "Adds a task to today's Daily Note." : "Adds a task to Inbox.md.")
            : dest === "note" ? "Creates a new note from this text."
            : "Adds a bullet to Inbox.md."}
        </div>
        {error && <p className="inline-error" role="alert">{error}</p>}
      </div>
    </Dialog>
  );
}
