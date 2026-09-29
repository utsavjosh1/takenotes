import { useCallback, useState } from "react";
import { getBridge } from "../bridge";
import type { Notify } from "./use-notify";

export type UpdatePhase = "checking" | "available" | "uptodate" | "downloading" | "verifying" | "launching" | "error";

export type UpdateDialogState = {
  phase: UpdatePhase; latest: string | null; notes: string | null; error: string | null;
  received: number; total: number | null;
};

export type UpdatesApi = {
  dialog: UpdateDialogState | null;
  check: (manual: boolean) => Promise<void>;
  download: () => Promise<void>;
  close: () => void;
};

/** In-app software updates (ADR-0006, Windows-only). Auto-checks stay
 * silent unless an update is actually available. */
export function useUpdates(notify: Notify, updatesCapable: boolean, closeSettings: () => void): UpdatesApi {
  const { toast } = notify;
  // Null = hidden.
  const [dialog, setDialog] = useState<UpdateDialogState | null>(null);

  const check = useCallback(async (manual: boolean) => {
    if (!updatesCapable) {
      if (manual) toast("Software updates are available on Windows in this version.", "error");
      return;
    }
    const bridge = getBridge();
    if (!bridge) {
      if (manual) toast("Software updates need the desktop app bridge.", "error");
      return;
    }
    if (manual) {
      closeSettings();
      setDialog({ phase: "checking", latest: null, notes: null, error: null, received: 0, total: null });
    }
    const res = await bridge.update.check(manual);
    if (!res.ok) {
      // Silent startup path stays silent for every update-check failure.
      // Manual checks are the only path that surfaces errors.
      if (!manual) { setDialog(null); return; }
      setDialog({ phase: "error", latest: null, notes: null, error: res.error.message, received: 0, total: null });
      return;
    }
    const r = res.result;
    if (r.updateAvailable && r.latestVersion) {
      setDialog({ phase: "available", latest: r.latestVersion, notes: r.releaseNotes, error: null, received: 0, total: null });
    } else if (manual) {
      setDialog({ phase: "uptodate", latest: null, notes: null, error: null, received: 0, total: null });
    } else {
      setDialog(null);
    }
  }, [updatesCapable, toast, closeSettings]);

  const download = useCallback(async () => {
    const bridge = getBridge();
    if (!bridge) { toast("Software updates need the desktop app bridge.", "error"); return; }
    setDialog((d) => (d ? { ...d, phase: "downloading", received: 0, total: null } : d));
    const off = bridge.events.onUpdateProgress((p) => {
      setDialog((d) => (d ? { ...d, phase: p.phase, received: p.receivedBytes, total: p.totalBytes } : d));
    });
    try {
      const res = await bridge.update.download();
      // ok → main launches the installer and quits; nothing left to render.
      if (!res.ok) setDialog((d) => (d ? { ...d, phase: "error", error: res.error.message } : d));
    } finally {
      off();
    }
  }, []);

  const close = useCallback(() => {
    setDialog(null);
  }, []);

  return { dialog, check, download, close };
}
