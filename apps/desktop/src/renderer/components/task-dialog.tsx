import { useState, type JSX } from "react";
import { Button, Dialog } from "@takenotes/ui/dom";
import { formatTaskLine } from "@takenotes/core/productivity/tasks";
import type { TaskCaptureTarget } from "@takenotes/core/productivity/tasks";

export type NewTaskInput = { text: string; due?: string };

/** New-task dialog (productivity step 2): text plus an optional explicit
 * `YYYY-MM-DD` due date. No natural-language parsing — an invalid date is
 * an inline error, never a guess. */
export function TaskDialog({ target, onSubmit, onClose }: {
  target: TaskCaptureTarget;
  onSubmit: (input: NewTaskInput) => void;
  onClose: () => void;
}): JSX.Element {
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = (): void => {
    try {
      formatTaskLine(text, due.trim() ? due : undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid task.");
      return;
    }
    onSubmit({ text: text.trim(), due: due.trim() ? due.trim() : undefined });
  };
  return (
    <Dialog
      title="New task"
      onClose={onClose}
      closeOnBackdrop
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Add task</Button></>}
    >
      <div className="task-dialog">
        <input
          className="cmd-input"
          autoFocus
          aria-label="Task text"
          placeholder="What needs doing?"
          value={text}
          onChange={(e) => { setText(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
        />
        <input
          className="cmd-input"
          aria-label="Due date (optional)"
          placeholder="Due YYYY-MM-DD (optional)"
          value={due}
          onChange={(e) => { setDue(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
        />
        <div className="cmd-section">
          {target === "daily" ? "Appends to today's Daily Note (never created silently)." : "Appends to Inbox.md."}
        </div>
        {error && <p className="inline-error" role="alert">{error}</p>}
      </div>
    </Dialog>
  );
}
