import { useCallback, useState } from "react";
import type { RecentWorkspaceInfo } from "@takenotes/contracts/ipc";

const RECENTS_KEY = "takenotes.recents";
const RECENT_WS_KEY = "takenotes.recentWs";
const MAX_FILES = 20;
const MAX_WORKSPACES = 8;

export type RecentWorkspace = RecentWorkspaceInfo | { name: string; kind: string; id?: undefined };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export type RecentsApi = {
  recents: string[];
  recentWorkspaces: RecentWorkspace[];
  recordFile: (relativePath: string) => void;
  recordWorkspace: (name: string, kind: string) => void;
  setRecentWorkspaces: (items: RecentWorkspaceInfo[]) => void;
};

/** Recently opened files + workspaces (welcome screen + quick open).
 * Local-only, never synced; persistence format unchanged. */
export function useRecents(): RecentsApi {
  const [recents, setRecents] = useState<string[]>(() => read<string[]>(RECENTS_KEY, []));
  const [recentWorkspaces, setRecentWorkspaces] = useState<RecentWorkspace[]>(() =>
    read<RecentWorkspace[]>(RECENT_WS_KEY, []),
  );

  const recordFile = useCallback((relativePath: string) => {
    setRecents((p) => {
      const next = [relativePath, ...p.filter((r) => r !== relativePath)].slice(0, MAX_FILES);
      localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const recordWorkspace = useCallback((name: string, kind: string) => {
    setRecentWorkspaces((p) => {
      const recentName = (r: RecentWorkspace): string => "displayName" in r ? r.displayName : r.name;
      const next = [{ name, kind }, ...p.filter((r) => recentName(r) !== name)].slice(0, MAX_WORKSPACES);
      localStorage.setItem(RECENT_WS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setRecentWorkspacesFromMain = useCallback((items: RecentWorkspaceInfo[]) => {
    setRecentWorkspaces(items);
    localStorage.setItem(RECENT_WS_KEY, JSON.stringify(items));
  }, []);

  return { recents, recentWorkspaces, recordFile, recordWorkspace, setRecentWorkspaces: setRecentWorkspacesFromMain };
}
