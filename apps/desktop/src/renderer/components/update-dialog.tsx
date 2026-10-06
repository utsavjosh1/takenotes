import type { JSX } from "react";
import { Button, Dialog, Notice } from "@takenotes/ui/dom";
import type { UpdateDialogState } from "../hooks/use-updates";

/** Pure view over the update state machine owned by useUpdates. */
export function UpdateDialog({ dialog, version, onClose, onDownload }: {
  dialog: UpdateDialogState;
  version: string;
  onClose: () => void;
  onDownload: () => void;
}): JSX.Element {
  const dismissible = dialog.phase !== "downloading" && dialog.phase !== "verifying" && dialog.phase !== "launching";
  const footer = dialog.phase === "available" ? <>
    <Button onClick={onClose}>Later</Button>
    <Button variant="primary" onClick={onDownload}>Download &amp; install</Button>
  </> : dialog.phase === "uptodate" || dialog.phase === "error" ? <Button variant="primary" onClick={onClose}>Close</Button> : undefined;
  return <Dialog title="Software update" onClose={onClose} dismissible={dismissible} closeOnBackdrop footer={footer}>
    <div className="dialog-stack">
      {dialog.phase === "checking" && <p role="status">Checking for updates…</p>}
      {dialog.phase === "uptodate" && <p>You have the latest version ({version}).</p>}
      {dialog.phase === "error" && dialog.error && <Notice tone="danger" announcement="assertive" title="Couldn’t update takenotes">{dialog.error}</Notice>}
      {dialog.phase === "available" && <>
        <p>Version {dialog.latest} is available (you have {version}).</p>
        {dialog.notes && <pre className="update-notes">{dialog.notes.slice(0, 800)}</pre>}
        <p className="supporting-copy">The installer is checksum-verified before it runs. Windows will still show a
          SmartScreen warning — these builds are unsigned; check the version matches before continuing.</p>
      </>}
      {(dialog.phase === "downloading" || dialog.phase === "verifying") && <p role="status">
        {dialog.phase === "downloading"
          ? `Downloading… ${(dialog.received / 1048576).toFixed(1)} MB${dialog.total ? ` of ${(dialog.total / 1048576).toFixed(1)} MB` : ""}`
          : "Verifying installer…"}
      </p>}
      {dialog.phase === "launching" && <p role="status">Verified — launching the installer…</p>}
    </div>
  </Dialog>;
}
