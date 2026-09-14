import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import { createMainWindow } from "../window.js";
import { WorkspaceRegistry, toWorkspaceInfo } from "../workspace/registry.js";
import { createTextFile, listDirectory, readTextFile, writeTextFile } from "../workspace/local-workspace.js";
import { validateWorkspaceId } from "../workspace/path-security.js";
import { searchWorkspace } from "../search/search.js";
import { listDistributions } from "../wsl/distributions.js";
import { HelperSupervisor } from "../wsl/helper-supervisor.js";

const registry = new WorkspaceRegistry();
let supervisor: HelperSupervisor | null = null;

function getSupervisor(onEvent: (kind: string, payload: unknown) => void): HelperSupervisor {
  if (!supervisor) {
    supervisor = new HelperSupervisor(
      (state) => onEvent("wsl-state", state),
      (line) => console.error(`[wsl-helper] ${line}`),
    );
  }
  return supervisor;
}

function senderIsOurs(event: Electron.IpcMainInvokeEvent): boolean {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win !== null && !win.isDestroyed();
}

export function registerIpc(broadcast: (kind: string, payload: unknown) => void): void {
  ipcMain.handle("workspace:openLocal", async (event) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const win = BrowserWindow.fromWebContents(event.sender)!;
    const result = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
    if (result.canceled || result.filePaths.length === 0) return { ok: true, result: null };
    const root = result.filePaths[0]!;
    const reg = registry.register("windows", path.basename(root), root);
    return { ok: true, result: { ...toWorkspaceInfo(reg), connection: "connected" as const } };
  });

  ipcMain.handle("workspace:close", async (event, workspaceId: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const v = validateWorkspaceId(workspaceId);
    if ("error" in v) return { ok: false, error: v.error };
    registry.close(v.workspaceId);
    return { ok: true, result: null };
  });

  ipcMain.handle("workspace:listWsl", async (event) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    try {
      const distros = await listDistributions();
      return { ok: true, result: distros };
    } catch (err) {
      return { ok: false, error: { code: "INTERNAL_ERROR", message: "WSL is not available.", detail: String(err) } };
    }
  });

  ipcMain.handle("wsl:connect", async (event, distro: unknown, linuxPath: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    if (typeof distro !== "string" || typeof linuxPath !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid WSL connection request." } };
    }
    try {
      const sup = getSupervisor(broadcast);
      const base = sup.resourceBase();
      await sup.connect(distro, path.join(base, "node"), path.join(base, "helper.cjs"));
      const reg = registry.register("wsl", `${distro}:${linuxPath}`, linuxPath, distro);
      const session = (sup as unknown as { sessionForTest?: unknown }).sessionForTest;
      void session;
      return { ok: true, result: { ...toWorkspaceInfo(reg), connection: "connected" as const } };
    } catch (err) {
      return { ok: false, error: { code: "DISCONNECTED", message: "Could not connect to WSL helper.", detail: String(err) } };
    }
  });

  ipcMain.handle("directory:list", async (event, workspaceId: unknown, relativePath: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const wid = validateWorkspaceId(workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    const reg = registry.get(wid.workspaceId);
    if (!reg) return { ok: false, error: { code: "INVALID_REQUEST", message: "Unknown workspace." } };
    if (reg.type !== "windows") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "WSL directory listing goes through the helper." } };
    }
    const rel = typeof relativePath === "string" ? relativePath : "";
    const out = await listDirectory(reg.root, rel);
    if ("error" in out) return { ok: false, error: out.error };
    return { ok: true, result: out.entries };
  });

  ipcMain.handle("file:read", async (event, workspaceId: unknown, relativePath: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const wid = validateWorkspaceId(workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    const reg = registry.get(wid.workspaceId);
    if (!reg) return { ok: false, error: { code: "INVALID_REQUEST", message: "Unknown workspace." } };
    if (reg.type !== "windows" || typeof relativePath !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid file read request." } };
    }
    const out = await readTextFile(reg.root, relativePath);
    if ("error" in out) return { ok: false, error: out.error };
    return { ok: true, result: out.result };
  });

  ipcMain.handle("file:write", async (event, args: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const a = args as { workspaceId?: unknown; relativePath?: unknown; content?: unknown; expectedHash?: unknown; newlineStyle?: unknown; hadBom?: unknown };
    const wid = validateWorkspaceId(a?.workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    const reg = registry.get(wid.workspaceId);
    if (!reg) return { ok: false, error: { code: "INVALID_REQUEST", message: "Unknown workspace." } };
    if (reg.type !== "windows" || typeof a?.relativePath !== "string" || typeof a?.content !== "string" || typeof a?.expectedHash !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid file write request." } };
    }
    const out = await writeTextFile(reg.root, a.relativePath, a.content, a.expectedHash, a.newlineStyle === "crlf" ? "crlf" : "lf", a.hadBom === true);
    if ("error" in out) return { ok: false, error: out.error };
    return { ok: true, result: out.revision };
  });

  ipcMain.handle("file:create", async (event, workspaceId: unknown, relativePath: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const wid = validateWorkspaceId(workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    const reg = registry.get(wid.workspaceId);
    if (!reg || reg.type !== "windows" || typeof relativePath !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid file create request." } };
    }
    const out = await createTextFile(reg.root, relativePath);
    if ("error" in out) return { ok: false, error: out.error };
    return { ok: true, result: out.revision };
  });

  ipcMain.handle("search:files", async (event, workspaceId: unknown, query: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const wid = validateWorkspaceId(workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    const reg = registry.get(wid.workspaceId);
    if (!reg || reg.type !== "windows" || typeof query !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid search request." } };
    }
    const matches = await searchWorkspace(reg.root, { query, includeFilenames: true, includeContent: false, maxResults: 200 });
    return { ok: true, result: matches };
  });

  ipcMain.handle("search:content", async (event, workspaceId: unknown, query: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const wid = validateWorkspaceId(workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    const reg = registry.get(wid.workspaceId);
    if (!reg || reg.type !== "windows" || typeof query !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid search request." } };
    }
    const matches = await searchWorkspace(reg.root, { query, includeFilenames: false, includeContent: true, maxResults: 1000 });
    return { ok: true, result: matches };
  });

  ipcMain.handle("app:version", () => ({ ok: true, result: app.getVersion() }));
}

export function createWindowIpc(): void {
  const win = createMainWindow(
    path.join(__dirname, "..", "preload", "index.cjs"),
    process.env["VITE_DEV_SERVER_URL"] ?? null,
    path.join(__dirname, "..", "..", "dist", "renderer"),
  );
  registerIpc((kind, payload) => {
    if (!win.isDestroyed()) win.webContents.send(`takenotes:${kind}`, payload);
  });
}
