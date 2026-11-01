import { useEffect, useState, type JSX } from "react";
import { Button, Dialog, EmptyState, Notice } from "@takenotes/ui/dom";
import { lineCount, snapshotLabel } from "@takenotes/core/save/decisions";
import type { HistoryDialogState } from "../hooks/use-documents";

/** Pure view over the history state owned by the documents hook: versions on the left, a preview on the right. */
export function HistoryDialog({ dialog, onClose, onRestore, onCopy, onPreview, onCopyToNote }: {
  dialog: HistoryDialogState;
  onClose: () => void;
  onRestore: (snapshotId: string) => void;
  onCopy: (snapshotId: string) => void;
  onPreview: (snapshotId: string) => Promise<string | null>;
  onCopyToNote: (snapshotId: string) => void;
}): JSX.Element {
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const active = selected ?? dialog.snapshots[0]?.snapshotId ?? null;
  useEffect(() => {
    if (!active) { setPreview(null); return; }
    let live = true;
    setPreview(null);
    void onPreview(active).then((text) => { if (live) setPreview(text ?? "Couldn’t read this version."); });
    return () => { live = false; };
  }, [active, onPreview]);
  return <Dialog title="Version history" size="wide" onClose={onClose} closeOnBackdrop>
    <div className="dialog-stack">
      <p className="supporting-copy">Versions are kept on this computer for 7 days. This is not a backup.</p>
      {dialog.loading && <p role="status">Loading versions…</p>}
      {dialog.error && <Notice tone="danger" announcement="assertive" title="Couldn’t load versions"><details><summary>Details</summary>{dialog.error}</details></Notice>}
      {!dialog.loading && !dialog.error && dialog.snapshots.length === 0 && <EmptyState title="No earlier versions yet" description="Versions appear here as you write." />}
      {!dialog.loading && dialog.snapshots.length > 0 && <div className="history-split">
        <ul className="history-list" aria-label="Versions">
          {dialog.snapshots.map((s) => <li key={s.snapshotId}>
            <button type="button" className="history-item" aria-current={s.snapshotId === active} onClick={() => setSelected(s.snapshotId)}>
              <span>{new Date(s.createdAt).toLocaleString()}</span>
              <span className="supporting-copy">{snapshotLabel(s.reason)}</span>
            </button>
          </li>)}
        </ul>
        <div className="history-preview">
          <pre className="history-text" aria-label="Preview">{preview ?? "Loading…"}</pre>
          {preview !== null && <p className="supporting-copy">{lineCount(preview)} lines</p>}
          {active && <div className="tn-actions">
            <Button variant="primary" onClick={() => onRestore(active)}>Restore this version</Button>
            <Button onClick={() => onCopyToNote(active)}>Copy to a new note</Button>
            <Button onClick={() => onCopy(active)}>Copy text</Button>
          </div>}
        </div>
      </div>}
    </div>
  </Dialog>;
}
