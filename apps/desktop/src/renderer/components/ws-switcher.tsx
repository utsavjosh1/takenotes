import { useEffect, useRef, useState, type JSX } from "react";
import { Button, Dialog } from "@takenotes/ui/dom";
import type { RecentWorkspaceInfo, WorkspaceInfo } from "@takenotes/contracts/ipc";
import { Icon } from "./icons";
import { kindLabel } from "./welcome";

type Pending = { run: () => void } | null;

/** Title-bar workspace button. Switching with unsaved notes asks first: Cancel, Discard, Save and switch. */
export function WorkspaceSwitcher({ workspace, recents, dirtyCount, onOpenRecent, onOpenFolder, onCreate, onClose, onSaveAll, onDiscardAll }: {
  workspace: WorkspaceInfo;
  recents: RecentWorkspaceInfo[];
  dirtyCount: number;
  onOpenRecent: (id: string) => void;
  onOpenFolder: () => void;
  onCreate: () => void;
  onClose: () => void;
  onSaveAll: () => Promise<boolean>;
  onDiscardAll: () => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [saving, setSaving] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent): void => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent): void => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const guard = (run: () => void): void => {
    setOpen(false);
    if (dirtyCount > 0) setPending({ run }); else run();
  };
  const others = recents.filter((r) => r.id !== workspace.workspaceId);
  return (
    <span className="ws-switch-wrap" ref={root}>
      <button className="ws-switch" aria-haspopup="menu" aria-expanded={open} title={workspace.displayName} onClick={() => setOpen((v) => !v)}>
        <span className={`kind kind-${kindLabel(workspace.type).toLowerCase()}`}>{kindLabel(workspace.type)}</span>
        <span className="ws-name">{workspace.displayName}</span>
        <Icon name="chevronDown" className="ws-chev" />
      </button>
      {open && (
        <div className="ws-menu" role="menu" aria-label="Workspaces">
          {others.map((r) => (
            <button key={r.id} role="menuitem" onClick={() => guard(() => onOpenRecent(r.id))}>
              <span className={`kind kind-${kindLabel(r.type).toLowerCase()}`}>{kindLabel(r.type)}</span>{r.displayName}
            </button>
          ))}
          {others.length > 0 && <hr />}
          <button role="menuitem" onClick={() => guard(onOpenFolder)}>Open a folder…</button>
          <button role="menuitem" onClick={() => guard(onCreate)}>Create a workspace…</button>
          <hr />
          <button role="menuitem" onClick={() => guard(onClose)}>Close workspace</button>
        </div>
      )}
      {pending && (
        <Dialog title="You have unsaved notes" onClose={() => setPending(null)} initialFocus={saveRef}
          footer={<>
            <Button onClick={() => setPending(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { onDiscardAll(); const p = pending; setPending(null); p.run(); }}>Discard</Button>
            <Button variant="primary" ref={saveRef} pending={saving} pendingLabel="Saving…" onClick={async () => {
              setSaving(true); const ok = await onSaveAll(); setSaving(false);
              if (ok) { const p = pending; setPending(null); p.run(); }
            }}>Save and switch</Button>
          </>}>
          <p>{dirtyCount === 1 ? "One note has" : `${dirtyCount} notes have`} changes that are not saved yet.</p>
        </Dialog>
      )}
    </span>
  );
}
