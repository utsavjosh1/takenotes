import { useState, type JSX } from "react";
import { Button, Dialog } from "@takenotes/ui/dom";
import { getBridge } from "../bridge";
import type { ImportPreview, ImportSummary } from "../../preload/index";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function capped<T>(rows: T[]): { shown: T[]; extra: number } {
  return rows.length > 30 ? { shown: rows.slice(0, 30), extra: rows.length - 30 } : { shown: rows, extra: 0 };
}

export function ImportDialog({ workspaceId, attachmentLocation, attachmentFolder, onClose, onDone }: {
  workspaceId: string;
  attachmentLocation: string;
  attachmentFolder: string;
  onClose: () => void;
  onDone: () => void;
}): JSX.Element {
  const [phase, setPhase] = useState<"choose" | "preview" | "done">("choose");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = (mode: "files" | "folder"): void => {
    const bridge = getBridge();
    if (!bridge) { setError("Desktop bridge unavailable — open via the Electron app."); return; }
    setBusy(true);
    setError(null);
    void bridge.import.pick(workspaceId, { mode, attachmentLocation, attachmentFolder }).then((res) => {
      setBusy(false);
      if (!res.ok) {
        if (res.error.code !== "CANCELLED") setError(res.error.message);
        return;
      }
      setPreview(res.result);
      setPhase("preview");
    });
  };

  const confirm = (): void => {
    const bridge = getBridge();
    if (!bridge || !preview) return;
    setBusy(true);
    setError(null);
    void bridge.import.confirm(workspaceId, preview.token).then((res) => {
      setBusy(false);
      if (!res.ok) { setError(res.error.message); return; }
      setSummary(res.result);
      setPhase("done");
    });
  };

  const notes = preview ? capped(preview.notes) : null;
  const attachments = preview ? capped(preview.attachments) : null;
  const unmapped = preview ? capped(preview.unmapped) : null;

  return (
    <Dialog title="Import notes" size="wide" onClose={onClose} closeOnBackdrop={phase !== "preview" || !busy}>
      {error && <p className="inline-error" role="alert">{error}</p>}
      {phase === "choose" && (<>
        <p className="muted">
          Markdown, HTML, and Textbundle (`.textbundle`) import. HTML converts to Markdown (formatting kept,
          layout not); images and files referenced by the notes copy into your attachments folder and links
          are rewritten. Remote images stay remote — nothing is fetched. Nothing is overwritten: clashes
          become `name 1.md`.
        </p>
        <div className="mcp-client-row">
          <Button disabled={busy} onClick={() => pick("files")}>{busy ? "Reading…" : "Import files…"}</Button>
          <Button disabled={busy} onClick={() => pick("folder")}>{busy ? "Reading…" : "Import a folder…"}</Button>
        </div>
      </>)}
      {phase === "preview" && preview && (<>
        <p className="muted">
          {preview.notes.length} note{preview.notes.length === 1 ? "" : "s"} → workspace root
          {preview.attachments.length > 0 && `, ${preview.attachments.length} attachment${preview.attachments.length === 1 ? "" : "s"}`}
          {preview.skipped.length > 0 && `, ${preview.skipped.length} skipped`}.
          {preview.unmapped.length > 0 && " Some links point outside the bundle and stay as-is."}
        </p>
        {notes && notes.shown.length > 0 && (<>
          <h3 className="settings-h">Notes</h3>
          <table className="kbd-table"><tbody>
            {notes.shown.map((n) => <tr key={n.targetPath}><td>{n.targetPath}</td><td style={{ textAlign: "right" }}>{n.sourceRel}</td></tr>)}
          </tbody></table>
          {notes.extra > 0 && <p className="muted">+{notes.extra} more</p>}
        </>)}
        {attachments && attachments.shown.length > 0 && (<>
          <h3 className="settings-h">Attachments</h3>
          <table className="kbd-table"><tbody>
            {attachments.shown.map((a) => <tr key={a.targetPath}><td>{a.targetPath}</td><td style={{ textAlign: "right" }}>{formatBytes(a.bytes)}</td></tr>)}
          </tbody></table>
          {attachments.extra > 0 && <p className="muted">+{attachments.extra} more</p>}
        </>)}
        {unmapped && unmapped.shown.length > 0 && (<>
          <h3 className="settings-h">Links kept as-is</h3>
          <table className="kbd-table"><tbody>
            {unmapped.shown.map((u, i) => <tr key={`${u.note}-${u.ref}-${i}`}><td>{u.ref}</td><td style={{ textAlign: "right" }}>{u.note}</td></tr>)}
          </tbody></table>
          {unmapped.extra > 0 && <p className="muted">+{unmapped.extra} more</p>}
        </>)}
        {preview.warnings.map((w, i) => <p className="inline-error" key={i}>{w}</p>)}
        {preview.skipped.map((s, i) => <p className="muted" key={i}>Skipped {s.rel}: {s.reason}.</p>)}
        <div className="mcp-client-row">
          <Button disabled={busy} onClick={confirm}>{busy ? "Importing…" : `Import ${preview.notes.length} note${preview.notes.length === 1 ? "" : "s"}`}</Button>
          <Button disabled={busy} onClick={() => { setPreview(null); setPhase("choose"); }}>Back</Button>
        </div>
      </>)}
      {phase === "done" && summary && (<>
        <p className="muted">
          Imported {summary.notes} note{summary.notes === 1 ? "" : "s"}
          {summary.attachments > 0 && ` and ${summary.attachments} attachment${summary.attachments === 1 ? "" : "s"}`}.
        </p>
        {summary.errors.map((e, i) => <p className="inline-error" key={i}>{e.target}: {e.message}</p>)}
        <div className="mcp-client-row">
          <Button onClick={() => { onDone(); onClose(); }}>Done</Button>
        </div>
      </>)}
    </Dialog>
  );
}
