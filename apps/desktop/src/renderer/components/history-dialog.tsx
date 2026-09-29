import type { JSX } from "react";
import { Button, Dialog, EmptyState, Notice } from "@takenotes/ui/dom";
import type { HistoryDialogState } from "../hooks/use-documents";

/** Pure view over the history state owned by the documents hook. */
export function HistoryDialog({ dialog, onClose, onRestore, onCopy }: {
  dialog: HistoryDialogState;
  onClose: () => void;
  onRestore: (snapshotId: string) => void;
  onCopy: (snapshotId: string) => void;
}): JSX.Element {
  return <Dialog title="Recovery history" onClose={onClose} closeOnBackdrop>
    <div className="dialog-stack">
      <p className="supporting-copy">Recovery is not backup. Snapshots are local to this app profile and retained for 7 days.</p>
      {dialog.loading && <p role="status">Loading recovery history…</p>}
      {dialog.error && <Notice tone="danger" announcement="assertive" title="Couldn’t load recovery history">{dialog.error}</Notice>}
      {!dialog.loading && !dialog.error && dialog.snapshots.length === 0 && <EmptyState title="No recovery snapshots" description="No recovery snapshots for this note yet." />}
      {!dialog.loading && dialog.snapshots.length > 0 && <div className="dialog-stack">
        {dialog.snapshots.map((s) => <div key={s.snapshotId} className="history-entry">
          <span>{new Date(s.createdAt).toLocaleString()} · {s.reason === "restore-before" ? "before restore" : s.reason} · {s.byteLength} bytes</span>
          <div className="tn-actions">
            <Button onClick={() => onRestore(s.snapshotId)}>Restore</Button>
            <Button onClick={() => onCopy(s.snapshotId)}>Copy</Button>
          </div>
        </div>)}
      </div>}
    </div>
  </Dialog>;
}
