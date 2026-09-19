import { contextBridge, ipcRenderer } from "electron";
import type {
  CommandListResult,
  DirectoryEntry,
  FileReadResult,
  FileRevision,
  IpcResult,
  PlatformReport,
  RecoveryRestoreResult,
  RecoverySnapshotMeta,
  RecoverySnapshotRead,
  UpdateCheckResult,
  UpdateProgress,
  WorkspaceInfo,
  WslDistribution,
  WslLinuxUser,
} from "../shared/contracts/ipc.js";
import type { CommandId } from "../shared/commands/registry.js";

/** Narrow typed preload bridge. No generic channel invocation is exposed. */
export type TakeNotesApi = {
  draft: {
    /** Persist a crash-recovery draft (debounced by the caller; recovery only, never `Saved`). */
    put(args: { workspaceId: string; relativePath: string; baseRevisionHash: string; content: string }): Promise<IpcResult<null>>;
    get(workspaceId: string, relativePath: string): Promise<IpcResult<DraftSummary | null>>;
    clear(workspaceId: string, relativePath: string): Promise<IpcResult<null>>;
  };
  recovery: {
    captureChanged(args: {
      workspaceId: string;
      relativePath: string;
      content: string;
      reason: "edit" | "save" | "close" | "shutdown" | "restore-before";
    }): Promise<IpcResult<RecoverySnapshotMeta | null>>;
    list(workspaceId: string, relativePath: string): Promise<IpcResult<RecoverySnapshotMeta[]>>;
    read(snapshotId: string): Promise<IpcResult<RecoverySnapshotRead>>;
    restore(args: {
      workspaceId: string;
      relativePath: string;
      snapshotId: string;
      currentContent: string;
      expectedHash: string;
      newlineStyle: "lf" | "crlf";
      hadBom: boolean;
    }): Promise<IpcResult<RecoveryRestoreResult>>;
  };
  workspace: {
    openLocal(): Promise<IpcResult<WorkspaceInfo | null>>;
    close(workspaceId: string): Promise<IpcResult<null>>;
    listWslDistributions(): Promise<IpcResult<WslDistribution[]>>;
    /** Interactive Linux users for one selected distro (`/etc/passwd`-backed).
     * Structured records only — no shell execution reaches the renderer. */
    listWslUsers(distro: string): Promise<IpcResult<WslLinuxUser[]>>;
    connectWsl(distro: string, linuxUser: string, linuxPath: string): Promise<IpcResult<WorkspaceInfo>>;
  };
  directory: {
    list(workspaceId: string, relativePath: string): Promise<IpcResult<DirectoryEntry[]>>;
    create(workspaceId: string, relativePath: string): Promise<IpcResult<null>>;
    rename(workspaceId: string, oldPath: string, newPath: string): Promise<IpcResult<null>>;
    delete(workspaceId: string, relativePath: string, recursive?: boolean): Promise<IpcResult<null>>;
  };
  file: {
    read(workspaceId: string, relativePath: string): Promise<IpcResult<FileReadResult>>;
    rename(workspaceId: string, oldPath: string, newPath: string): Promise<IpcResult<null>>;
    trash(workspaceId: string, relativePath: string): Promise<IpcResult<null>>;
    write(args: {
      workspaceId: string;
      relativePath: string;
      content: string;
      expectedHash: string;
      newlineStyle: "lf" | "crlf";
      hadBom: boolean;
    }): Promise<IpcResult<FileRevision>>;
    create(workspaceId: string, relativePath: string): Promise<IpcResult<FileRevision>>;
  };
  shell: {
    reveal(workspaceId: string, relativePath: string): Promise<IpcResult<null>>;
  };
  commands: {
    list(): Promise<IpcResult<CommandListResult>>;
  };
  app: {
    version(): Promise<IpcResult<string>>;
    platform(): Promise<IpcResult<PlatformReport>>;
  };
  update: {
    /** Check for a newer stable release. `manual=true` always runs (shows
     *  errors); `false` is the silent startup path (cadence-gated). */
    check(manual: boolean): Promise<IpcResult<UpdateCheckResult>>;
    /** Download, checksum-verify, launch installer, quit. */
    download(): Promise<IpcResult<null>>;
  };
  events: {
    onWslState(callback: (state: string) => void): () => void;
    onUpdateProgress(callback: (progress: UpdateProgress) => void): () => void;
    onCommand(callback: (id: CommandId) => void): () => void;
  };
};

export type DraftSummary = {
  content: string;
  baseRevisionHash: string;
  updatedAt: number;
  stale: boolean;
};

const api: TakeNotesApi = {
  draft: {
    put: (args) => ipcRenderer.invoke("draft:put", args),
    get: (workspaceId, relativePath) => ipcRenderer.invoke("draft:get", workspaceId, relativePath),
    clear: (workspaceId, relativePath) => ipcRenderer.invoke("draft:clear", workspaceId, relativePath),
  },
  recovery: {
    captureChanged: (args) => ipcRenderer.invoke("recovery:captureChanged", args),
    list: (workspaceId, relativePath) => ipcRenderer.invoke("recovery:list", workspaceId, relativePath),
    read: (snapshotId) => ipcRenderer.invoke("recovery:read", snapshotId),
    restore: (args) => ipcRenderer.invoke("recovery:restore", args),
  },
  workspace: {
    openLocal: () => ipcRenderer.invoke("workspace:openLocal"),
    close: (workspaceId) => ipcRenderer.invoke("workspace:close", workspaceId),
    listWslDistributions: () => ipcRenderer.invoke("workspace:listWsl"),
    listWslUsers: (distro) => ipcRenderer.invoke("workspace:listWslUsers", distro),
    connectWsl: (distro, linuxUser, linuxPath) => ipcRenderer.invoke("wsl:connect", distro, linuxUser, linuxPath),
  },
  directory: {
    list: (workspaceId, relativePath) => ipcRenderer.invoke("directory:list", workspaceId, relativePath),
    create: (workspaceId, relativePath) => ipcRenderer.invoke("directory:create", workspaceId, relativePath),
    rename: (workspaceId, oldPath, newPath) => ipcRenderer.invoke("directory:rename", workspaceId, oldPath, newPath),
    delete: (workspaceId, relativePath, recursive) =>
      ipcRenderer.invoke("directory:delete", workspaceId, relativePath, recursive),
  },
  file: {
    read: (workspaceId, relativePath) => ipcRenderer.invoke("file:read", workspaceId, relativePath),
    rename: (workspaceId, oldPath, newPath) => ipcRenderer.invoke("file:rename", workspaceId, oldPath, newPath),
    trash: (workspaceId, relativePath) => ipcRenderer.invoke("file:trash", workspaceId, relativePath),
    write: (args) => ipcRenderer.invoke("file:write", args),
    create: (workspaceId, relativePath) => ipcRenderer.invoke("file:create", workspaceId, relativePath),
  },
  shell: {
    reveal: (workspaceId, relativePath) => ipcRenderer.invoke("shell:reveal", workspaceId, relativePath),
  },
  commands: {
    list: () => ipcRenderer.invoke("commands:list"),
  },
  app: {
    version: () => ipcRenderer.invoke("app:version"),
    platform: () => ipcRenderer.invoke("app:platform"),
  },
  update: {
    check: (manual) => ipcRenderer.invoke("update:check", manual),
    download: () => ipcRenderer.invoke("update:download"),
  },
  events: {
    onWslState: (callback) => {
      const listener = (_event: unknown, state: string) => callback(state);
      ipcRenderer.on("takenotes:wsl-state", listener as (...args: unknown[]) => void);
      return () => ipcRenderer.removeListener("takenotes:wsl-state", listener as (...args: unknown[]) => void);
    },
    onUpdateProgress: (callback) => {
      const listener = (_event: unknown, progress: UpdateProgress) => callback(progress);
      ipcRenderer.on("takenotes:update-progress", listener as (...args: unknown[]) => void);
      return () => ipcRenderer.removeListener("takenotes:update-progress", listener as (...args: unknown[]) => void);
    },
    onCommand: (callback) => {
      const listener = (_event: unknown, id: CommandId) => callback(id);
      ipcRenderer.on("takenotes:command", listener as (...args: unknown[]) => void);
      return () => ipcRenderer.removeListener("takenotes:command", listener as (...args: unknown[]) => void);
    },
  },
};

contextBridge.exposeInMainWorld("takenotes", api);

declare global {
  interface Window {
    takenotes: TakeNotesApi;
  }
}
