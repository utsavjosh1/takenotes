import { contextBridge, ipcRenderer } from "electron";
import type {
  DirectoryEntry,
  FileReadResult,
  FileRevision,
  IpcResult,
  SearchMatch,
  WorkspaceInfo,
  WslDistribution,
} from "../shared/contracts/ipc.js";

/** Narrow typed preload bridge. No generic channel invocation is exposed. */
export type TakeNotesApi = {
  workspace: {
    openLocal(): Promise<IpcResult<WorkspaceInfo | null>>;
    close(workspaceId: string): Promise<IpcResult<null>>;
    listWslDistributions(): Promise<IpcResult<WslDistribution[]>>;
    connectWsl(distro: string, linuxPath: string): Promise<IpcResult<WorkspaceInfo>>;
  };
  directory: {
    list(workspaceId: string, relativePath: string): Promise<IpcResult<DirectoryEntry[]>>;
  };
  file: {
    read(workspaceId: string, relativePath: string): Promise<IpcResult<FileReadResult>>;
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
  search: {
    files(workspaceId: string, query: string): Promise<IpcResult<SearchMatch[]>>;
    content(workspaceId: string, query: string): Promise<IpcResult<SearchMatch[]>>;
  };
  app: {
    version(): Promise<IpcResult<string>>;
  };
  events: {
    onWslState(callback: (state: string) => void): () => void;
  };
};

const api: TakeNotesApi = {
  workspace: {
    openLocal: () => ipcRenderer.invoke("workspace:openLocal"),
    close: (workspaceId) => ipcRenderer.invoke("workspace:close", workspaceId),
    listWslDistributions: () => ipcRenderer.invoke("workspace:listWsl"),
    connectWsl: (distro, linuxPath) => ipcRenderer.invoke("wsl:connect", distro, linuxPath),
  },
  directory: {
    list: (workspaceId, relativePath) => ipcRenderer.invoke("directory:list", workspaceId, relativePath),
  },
  file: {
    read: (workspaceId, relativePath) => ipcRenderer.invoke("file:read", workspaceId, relativePath),
    write: (args) => ipcRenderer.invoke("file:write", args),
    create: (workspaceId, relativePath) => ipcRenderer.invoke("file:create", workspaceId, relativePath),
  },
  search: {
    files: (workspaceId, query) => ipcRenderer.invoke("search:files", workspaceId, query),
    content: (workspaceId, query) => ipcRenderer.invoke("search:content", workspaceId, query),
  },
  app: {
    version: () => ipcRenderer.invoke("app:version"),
  },
  events: {
    onWslState: (callback) => {
      const listener = (_event: unknown, state: string) => callback(state);
      ipcRenderer.on("takenotes:wsl-state", listener as (...args: unknown[]) => void);
      return () => ipcRenderer.removeListener("takenotes:wsl-state", listener as (...args: unknown[]) => void);
    },
  },
};

contextBridge.exposeInMainWorld("takenotes", api);

declare global {
  interface Window {
    takenotes: TakeNotesApi;
  }
}
