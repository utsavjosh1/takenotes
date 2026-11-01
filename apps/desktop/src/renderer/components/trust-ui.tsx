import { useMemo, type JSX } from "react";
import { Button, Dialog, Notice } from "@takenotes/ui/dom";
import { sideBySide } from "@takenotes/core/save/decisions";
import type { CompareState, SaveFailureDialog } from "../hooks/use-documents";

/** Banners and dialogs for the trust layer. The decisions live in core/save/decisions; these only show them. */

export function ConflictBanner({ name, onCompare, onKeepMine, onUseOther }: { name: string; onCompare: () => void; onKeepMine: () => void; onUseOther: () => void }): JSX.Element {
  return <Notice className="pane-notice" tone="warning" announcement="assertive" title="This note changed somewhere else."
    actions={<>
      <Button onClick={onCompare}>Compare</Button>
      <Button onClick={onKeepMine}>Keep mine</Button>
      <Button variant="primary" onClick={onUseOther}>Use the other one</Button>
    </>}>
    You also have changes in {name}, so nothing was merged. Both versions are safe, and the one you don’t pick goes to history.
  </Notice>;
}

export function DeletedBanner({ name, onSaveAsNew, onRestore, onClose }: { name: string; onSaveAsNew: () => void; onRestore: () => void; onClose: () => void }): JSX.Element {
  return <Notice className="pane-notice" tone="danger" announcement="assertive" title="This note was deleted outside takenotes."
    actions={<>
      <Button onClick={onSaveAsNew}>Save as new note</Button>
      <Button variant="primary" onClick={onRestore}>Restore note</Button>
      <Button onClick={onClose}>Close</Button>
    </>}>
    Your text from {name} is still here. Nothing is saved until you choose.
  </Notice>;
}

export function ReadOnlyBanner({ onCopy }: { onCopy: () => void }): JSX.Element {
  return <Notice className="pane-notice" tone="warning" announcement="polite" title="This note can’t be changed here."
    actions={<Button variant="primary" onClick={onCopy}>Copy to a new note</Button>}>
    The file is protected. Your edits stay on screen until you copy them.
  </Notice>;
}

export function DisconnectedBanner({ detail, onCopyDetails, onReconnect }: { detail: string; onCopyDetails: () => void; onReconnect: () => void }): JSX.Element {
  return <Notice className="pane-notice" tone="danger" announcement="assertive" title="The connection is down."
    actions={<>
      <Button onClick={onCopyDetails}>Copy details</Button>
      <Button variant="primary" onClick={onReconnect}>Reconnect</Button>
    </>}>
    Keep writing. Changes save when it comes back. <details><summary>Details</summary>{detail}</details>
  </Notice>;
}

export function RenamePreviewDialog({ from, to, summary, onGo, onCancel }: { from: string; to: string; summary: string; onGo: () => void; onCancel: () => void }): JSX.Element {
  return <Dialog title="Rename this note?" onClose={onCancel}
    footer={<>
      <Button onClick={onCancel}>Cancel</Button>
      <Button variant="primary" onClick={onGo}>Rename</Button>
    </>}>
    <div className="dialog-stack">
      <p><strong>{from}</strong> becomes <strong>{to}</strong>.</p>
      <p>{summary}</p>
    </div>
  </Dialog>;
}

export function SaveFailureDialogView({ failure, name, onCopy, onRetry, onClose }: { failure: SaveFailureDialog; name: string; onCopy: () => void; onRetry: () => void; onClose: () => void }): JSX.Element {
  return <Dialog title="Could not save" onClose={onClose}
    footer={<>
      <Button onClick={onClose}>Close</Button>
      <Button onClick={onRetry}>Try again</Button>
      <Button variant="primary" onClick={onCopy}>Copy to a new note</Button>
    </>}>
    <div className="dialog-stack">
      <p>{name} couldn’t be saved. Your text is still here and nothing was lost.</p>
      <details><summary>Details</summary><p className="supporting-copy">{failure.message}</p></details>
    </div>
  </Dialog>;
}

export function CompareDialog({ compare, name, onKeepMine, onUseOther, onClose }: { compare: CompareState; name: string; onKeepMine: () => void; onUseOther: () => void; onClose: () => void }): JSX.Element {
  const rows = useMemo(() => sideBySide(compare.mine, compare.theirs), [compare.mine, compare.theirs]);
  return <Dialog title={`Compare ${name}`} size="wide" onClose={onClose}
    footer={<>
      <Button onClick={onClose}>Close</Button>
      <Button onClick={onKeepMine}>Keep mine</Button>
      <Button variant="primary" onClick={onUseOther}>Use the other one</Button>
    </>}>
    <div className="compare-grid" role="table" aria-label="Your version beside the other version">
      <div className="compare-head" role="row"><span role="columnheader">Mine</span><span role="columnheader">The other one</span></div>
      {rows.map((r, i) => <div key={i} className="compare-row" role="row">
        <pre role="cell" className={`compare-cell${r.left ? ` compare-${r.left.kind}` : " compare-empty"}`}>{r.left?.text ?? ""}</pre>
        <pre role="cell" className={`compare-cell${r.right ? ` compare-${r.right.kind}` : " compare-empty"}`}>{r.right?.text ?? ""}</pre>
      </div>)}
    </div>
  </Dialog>;
}
