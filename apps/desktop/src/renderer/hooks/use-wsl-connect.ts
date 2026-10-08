import { useCallback, useRef, useState } from "react";
import type { WorkspaceInfo, WslDistribution, WslLinuxUser } from "@takenotes/contracts/ipc";
import { getBridge } from "../bridge";
import type { WslConnectInput } from "@takenotes/core/validation/schemas";
import { describeWslError } from "../error-text";
import type { Notify } from "./use-notify";

export type WslDialogState = {
  distros: WslDistribution[]; initialDistro: string;
  users: WslLinuxUser[];
  usersLoading: boolean; usersError: string | null;
  error: string | null; connecting: boolean;
};

export type WslConnectApi = {
  dialog: WslDialogState | null;
  open: () => Promise<void>;
  fetchUsers: (distro: string) => Promise<void>;
  connect: (data: WslConnectInput) => Promise<void>;
  close: () => void;
};

/** WSL connect dialog state machine. Form state (distro/user/path) lives
 * in the dialog component (React Hook Form); this hook owns the server
 * data (distros, users, progress, errors) and the connect IPC call. */
export function useWslConnect(
  notify: Notify,
  onConnected: (ws: WorkspaceInfo) => Promise<void>,
): WslConnectApi {
  const { toast } = notify;
  const [dialog, setDialog] = useState<WslDialogState | null>(null);
  /** Distro the in-flight user list belongs to (stale-response guard). */
  const distroRef = useRef("");

  const fetchUsers = useCallback(async (distro: string) => {
    distroRef.current = distro;
    setDialog((cur) => (cur ? { ...cur, users: [], usersLoading: true, usersError: null } : cur));
    const bridge = getBridge();
    if (!bridge) {
      setDialog((cur) => (cur ? { ...cur, users: [], usersLoading: false, usersError: "Desktop bridge unavailable." } : cur));
      return;
    }
    const res = await bridge.workspace.listWslUsers(distro);
    // The dialog may have closed or switched distros while loading: only
    // apply results that still belong to the requested distro.
    setDialog((cur) => {
      if (!cur || distroRef.current !== distro) return cur;
      if (!res.ok) return { ...cur, users: [], usersLoading: false, usersError: res.error.message };
      return { ...cur, users: res.result, usersLoading: false, usersError: null };
    });
  }, []);

  const open = useCallback(async () => {
    const bridge = getBridge();
    if (!bridge) {
      setDialog({ distros: [], initialDistro: "", users: [], usersLoading: false, usersError: null, error: "Desktop bridge unavailable — open via the Electron app.", connecting: false });
      return;
    }
    const res = await bridge.workspace.listWslDistributions();
    if (!res.ok) {
      setDialog({ distros: [], initialDistro: "", users: [], usersLoading: false, usersError: null, error: res.error.message, connecting: false });
      return;
    }
    const distro = res.result[0]?.name ?? "";
    distroRef.current = distro;
    setDialog({ distros: res.result, initialDistro: distro, users: [], usersLoading: true, usersError: null, error: null, connecting: false });
    if (distro) void fetchUsers(distro);
  }, [fetchUsers]);

  const connect = useCallback(async (data: WslConnectInput) => {
    setDialog((cur) => (cur ? { ...cur, connecting: true, error: null } : cur));
    const bridge = getBridge();
    if (!bridge) {
      setDialog((cur) => (cur ? { ...cur, connecting: false, error: "Desktop bridge unavailable." } : cur));
      return;
    }
    const res = await bridge.workspace.connectWsl(data.distro, data.linuxUser, data.path || "~/notes");
    // Friendly + detail UI (7c): headline + helper message + next-step hint.
    // The code stays on the result for any future branching; the dialog
    // renders this composed string.
    const error = res.ok
      ? null
      : describeWslError(res.error.code, res.error.message, {
          operation: "open", distro: data.distro, linuxUser: data.linuxUser, path: data.path || "~/notes",
        });
    setDialog((cur) => (cur ? { ...cur, connecting: false, error } : cur));
    if (res.ok) {
      setDialog(null);
      toast(`Connecting to ${data.distro} as ${data.linuxUser}…`);
      await onConnected(res.result);
    }
  }, [onConnected, toast]);

  const close = useCallback(() => {
    setDialog(null);
  }, []);

  return { dialog, open, fetchUsers, connect, close };
}
