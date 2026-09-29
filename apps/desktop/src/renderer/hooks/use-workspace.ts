import { useCallback, useState } from "react";
import type { WorkspaceInfo } from "@takenotes/contracts/ipc";
import { getBridge } from "../bridge";
import type { Notify } from "./use-notify";

export type WorkspaceApi = {
  workspace: WorkspaceInfo | null;
  openWorkspace: (ws: WorkspaceInfo) => Promise<void>;
  openLocal: () => Promise<void>;
  openRecent: (id: string) => Promise<void>;
  closeWorkspace: () => Promise<void>;
  /** WSL-index/tree failure banner; null = connected. */
  healthError: string | null;
  reportHealth: (message: string | null) => void;
};

export type WorkspaceOpenedHooks = {
  onOpened: (ws: WorkspaceInfo) => Promise<void>;
  onClosed: () => void;
};

/** Workspace session: which workspace is open and the open/close flows.
 * Post-open refresh (tree, files, index, recents) and post-close reset are
 * choreography supplied by the composition root — this hook owns the
 * session state and the IPC calls, not the other domains' refresh. */
export function useWorkspace(notify: Notify, hooks: WorkspaceOpenedHooks): WorkspaceApi {
  const { toast } = notify;
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  const reportHealth = useCallback((message: string | null) => {
    setHealthError(message);
  }, []);

  const openWorkspace = useCallback(async (ws: WorkspaceInfo) => {
    if (workspace && workspace.workspaceId !== ws.workspaceId) {
      await getBridge()?.workspace.close(workspace.workspaceId).catch(() => undefined);
    }
    setWorkspace(ws);
    reportHealth(null);
    await hooks.onOpened(ws);
    // Index builds in the background: open stays fast on big workspaces.
  }, [workspace, hooks, reportHealth]);

  const openLocal = useCallback(async () => {
    const bridge = getBridge();
    if (!bridge) { toast("Desktop bridge unavailable — open via the Electron app.", "error"); return; }
    const res = await bridge.workspace.openLocal();
    if (!res.ok) { toast(res.error.message, "error"); return; }
    if (res.result) void openWorkspace(res.result);
  }, [openWorkspace, toast]);

  const openRecent = useCallback(async (id: string) => {
    const bridge = getBridge();
    if (!bridge) { toast("Desktop bridge unavailable — open via the Electron app.", "error"); return; }
    const res = await bridge.workspace.openRecent(id);
    if (!res.ok) { toast(res.error.message, "error"); return; }
    await openWorkspace(res.result);
  }, [openWorkspace, toast]);

  const closeWorkspace = useCallback(async () => {
    if (!workspace) return;
    await getBridge()?.workspace.close(workspace.workspaceId).catch(() => undefined);
    setWorkspace(null);
    reportHealth(null);
    hooks.onClosed();
  }, [workspace, hooks, reportHealth]);

  return { workspace, openWorkspace, openLocal, openRecent, closeWorkspace, healthError, reportHealth };
}
