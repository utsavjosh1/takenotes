import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "node:path";
import { createMainWindow } from "../window.js";
import { WorkspaceRegistry, isNativeWorkspace, toWorkspaceInfo } from "../workspace/registry.js";
import {
  createTextFile,
  listDirectory,
  readTextFile,
  renamePath,
  resolveInsideRoot,
  writeTextFile,
} from "../workspace/local-workspace.js";
import { validatePosixRelativePath, validateWindowsRelativePath } from "../workspace/path-security.js";
import { validateWorkspaceId } from "../workspace/path-security.js";
import type { WorkspaceKind } from "../../shared/platform/types.js";
import { searchWorkspace } from "../search/search.js";
import { clearDraft, isDraftStale, loadDraft, MAX_DRAFT_BYTES, saveDraft } from "../workspace/drafts.js";
import { listDistributions } from "../wsl/distributions.js";
import { HelperSupervisor } from "../wsl/helper-supervisor.js";
import { currentDesktopPlatform } from "../../shared/platform/platform.js";
import { getCapabilities } from "../../shared/platform/capabilities.js";
import { localWorkspaceKind, toCanonicalRel } from "../../shared/platform/filesystem.js";
import { shortcutLabelsFor } from "../../shared/platform/shortcut-labels.js";
import { detectWayland } from "../platform/linux.js";
import type { DirectoryEntry, PlatformReport, SearchMatch } from "../../shared/contracts/ipc.js";
import type { AppError } from "../../shared/errors.js";

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

/** WSL is a Windows-only capability (§2, §18, §184–§185). All other platforms
 *  receive a precise NOT APPLICABLE-style error, never a generic failure. */
function requireWslCapable(): { ok: true } | { ok: false; error: { code: "INVALID_REQUEST"; message: string } } {
  if (!getCapabilities(currentDesktopPlatform()).wsl) {
    return {
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        message: "WSL workspaces are a Windows-only capability and are not available on this platform.",
      },
    };
  }
  return { ok: true };
}

/** Kind-appropriate validation for native workspaces (§25): Windows
 *  reserved-name rules apply to `windows-local` only. */
function validateNativeRel(kind: WorkspaceKind, input: string): { relativePath: string } | { error: AppError } {
  return kind === "windows-local" ? validateWindowsRelativePath(input) : validatePosixRelativePath(input);
}

function senderIsOurs(event: Electron.IpcMainInvokeEvent): boolean {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win !== null && !win.isDestroyed();
}

/** Preserve structured helper errors (NOT_FOUND, CONFLICT, INVALID_PATH, …)
 * across the IPC boundary; unexpected failures become INTERNAL_ERROR. */
function toHelperError(err: unknown): AppError {
  if (err && typeof err === "object" && typeof (err as { code?: unknown }).code === "string") {
    const e = err as AppError;
    return e.detail === undefined ? { code: e.code, message: e.message } : { code: e.code, message: e.message, detail: e.detail };
  }
  return { code: "INTERNAL_ERROR", message: "WSL operation failed.", detail: String(err) };
}

function helperDisconnected(): { ok: false; error: AppError } {
  return { ok: false, error: { code: "DISCONNECTED", message: "WSL helper is not connected." } };
}

/** Draft storage root: outside every note workspace, under the Electron profile. */
function draftsBaseDir(): string {
  return app.getPath("userData");
}

/** Runtime validation for draft payloads (privileged IPC: sender + shape checked). */
function validateDraftPut(args: unknown):
  | { workspaceId: string; relativePath: string; baseRevisionHash: string; content: string }
  | { error: AppError } {
  const a = args as { workspaceId?: unknown; relativePath?: unknown; baseRevisionHash?: unknown; content?: unknown };
  const wid = validateWorkspaceId(a?.workspaceId);
  if ("error" in wid) return { error: wid.error };
  if (typeof a?.relativePath !== "string" || typeof a?.content !== "string" || typeof a?.baseRevisionHash !== "string") {
    return { error: { code: "INVALID_REQUEST", message: "Invalid draft request." } };
  }
  const rel = toCanonicalRel(a.relativePath);
  if (rel === "" || rel.length > 1024 || a.content.length > MAX_DRAFT_BYTES) {
    return { error: { code: "INVALID_REQUEST", message: "Invalid draft request." } };
  }
  if (!/^[a-f0-9]{64}$/.test(a.baseRevisionHash)) {
    return { error: { code: "INVALID_REQUEST", message: "Invalid draft request." } };
  }
  return { workspaceId: wid.workspaceId, relativePath: rel, baseRevisionHash: a.baseRevisionHash, content: a.content };
}

/** Canonicalize a renderer-supplied path for the WSL helper (POSIX `/`).
 * Deep validation (traversal, symlinks) lives in the helper; main only
 * rejects malformed wire values before forwarding. */
function normalizeWslRel(input: unknown, allowEmpty: boolean): { rel: string } | { error: AppError } {
  if (typeof input !== "string") {
    return { error: { code: "INVALID_REQUEST", message: "Invalid path." } };
  }
  if (input.includes("\0")) {
    return { error: { code: "INVALID_REQUEST", message: "Invalid path." } };
  }
  const rel = toCanonicalRel(input);
  if (rel === "") {
    if (allowEmpty) return { rel: "" };
    return { error: { code: "INVALID_REQUEST", message: "Invalid path." } };
  }
  if (rel.length > 1024) return { error: { code: "INVALID_REQUEST", message: "Invalid path." } };
  return { rel };
}

const WSL_SEARCH_EXCLUDED = new Set([".git", "node_modules", "dist", "build", "coverage", ".next", ".cache"]);
const WSL_SEARCH_TEXT_EXTS = new Set([".md", ".markdown", ".txt"]);

/** WSL content/filename search composed from helper primitives.
 * The helper implements directory.list + file.read (no search.* op), so main
 * traverses via HelperClient: connect → hello → workspace.open → these calls. */
async function searchWslWorkspace(
  sup: HelperSupervisor,
  options: { query: string; includeFilenames: boolean; includeContent: boolean; maxResults: number },
): Promise<SearchMatch[]> {
  const { query, includeFilenames, includeContent, maxResults } = options;
  const needle = query.toLowerCase();
  const matches: SearchMatch[] = [];
  const dirs: string[] = [""];
  const textFiles: string[] = [];
  const seen = new Set<string>([""]);
  while (dirs.length > 0 && matches.length < maxResults) {
    const dir = dirs.pop()!;
    let entries: DirectoryEntry[];
    try {
      entries = (await sup.request("directory.list", { relativePath: dir })) as DirectoryEntry[];
    } catch {
      continue;
    }
    for (const e of entries) {
      if (matches.length >= maxResults) break;
      if (e.kind === "directory") {
        if (!WSL_SEARCH_EXCLUDED.has(e.name) && !seen.has(e.relativePath)) {
          seen.add(e.relativePath);
          dirs.push(e.relativePath);
        }
      } else {
        if (includeFilenames && e.relativePath.toLowerCase().includes(needle)) {
          matches.push({ relativePath: e.relativePath, line: 0, column: 0, preview: e.relativePath });
          if (matches.length >= maxResults) break;
        }
        if (includeContent) {
          const lower = e.relativePath.toLowerCase();
          const dot = lower.lastIndexOf(".");
          const ext = dot >= 0 ? lower.slice(dot) : "";
          if (WSL_SEARCH_TEXT_EXTS.has(ext)) textFiles.push(e.relativePath);
        }
      }
    }
  }
  if (includeContent && matches.length < maxResults) {
    // Bounded concurrency: 16 parallel reads keeps large trees responsive.
    const CONCURRENCY = 16;
    for (let i = 0; i < textFiles.length && matches.length < maxResults; i += CONCURRENCY) {
      const batch = textFiles.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (rel) => {
          try {
            const file = (await sup.request("file.read", { relativePath: rel })) as { content: string };
            return { rel, content: file.content };
          } catch {
            return null;
          }
        }),
      );
      for (const r of results) {
        if (!r || matches.length >= maxResults) continue;
        const lines = r.content.split("\n");
        for (let n = 0; n < lines.length; n++) {
          const col = lines[n]!.toLowerCase().indexOf(needle);
          if (col >= 0) {
            matches.push({ relativePath: r.rel, line: n + 1, column: col + 1, preview: lines[n]!.slice(0, 200) });
            break; // one match per file keeps results bounded
          }
        }
      }
    }
  }
  return matches.slice(0, maxResults);
}

export function registerIpc(broadcast: (kind: string, payload: unknown) => void): void {
  // Platform report for the renderer hook + `npm run test:platform` (§210).
  // Uses app.getPath — never hardcoded platform paths (§19–§20, §100–§102).
  ipcMain.handle("app:platform", () => {
    const platform = currentDesktopPlatform();
    const report: PlatformReport = {
      platform,
      arch: process.arch,
      capabilities: {
        wsl: getCapabilities(platform).wsl,
        macTrafficLights: getCapabilities(platform).macTrafficLights,
        supportsWayland: getCapabilities(platform).supportsWayland,
      },
      workspaceKind: localWorkspaceKind(platform),
      wayland: platform === "linux" ? detectWayland() : false,
      shortcuts: shortcutLabelsFor(platform),
    };
    return { ok: true, result: report };
  });

  ipcMain.handle("workspace:openLocal", async (event) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const win = BrowserWindow.fromWebContents(event.sender)!;
    // Native Explorer / Finder / desktop file picker (§17, §160).
    const result = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
    if (result.canceled || result.filePaths.length === 0) return { ok: true, result: null };
    const root = result.filePaths[0]!;
    const reg = registry.register(localWorkspaceKind(currentDesktopPlatform()), path.basename(root), root);
    return { ok: true, result: { ...toWorkspaceInfo(reg), connection: "connected" as const } };
  });

  ipcMain.handle("workspace:close", async (event, workspaceId: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const v = validateWorkspaceId(workspaceId);
    if ("error" in v) return { ok: false, error: v.error };
    const reg = registry.get(v.workspaceId);
    if (reg && !isNativeWorkspace(reg) && supervisor?.getSession()) {
      // Best-effort: release the helper-side root; registry close always runs.
      try {
        await supervisor.request("workspace.close", {});
      } catch {
        /* helper already gone — registry is the source of truth */
      }
    }
    registry.close(v.workspaceId);
    return { ok: true, result: null };
  });

  ipcMain.handle("workspace:listWsl", async (event) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const gate = requireWslCapable();
    if (!gate.ok) return gate;
    try {
      const distros = await listDistributions();
      return { ok: true, result: distros };
    } catch (err) {
      return { ok: false, error: { code: "INTERNAL_ERROR", message: "WSL is not available.", detail: String(err) } };
    }
  });

  ipcMain.handle("wsl:connect", async (event, distro: unknown, linuxPath: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const gate = requireWslCapable();
    if (!gate.ok) return gate;
    // Distro names travel as spawn argv (shell:false) and into UI text: constrain
    // them to plausible distribution identifiers before any use.
    const distroOk =
      typeof distro === "string" &&
      distro.length >= 1 &&
      distro.length <= 128 &&
      !distro.includes("\0") &&
      !distro.includes("/") &&
      !distro.includes("\\") &&
      distro.trim() === distro;
    // The helper requires an absolute POSIX root; validate before connect so a
    // bad root never leaves behind a connected-but-useless session.
    const pathOk =
      typeof linuxPath === "string" &&
      linuxPath.length >= 1 &&
      linuxPath.length <= 1024 &&
      !linuxPath.includes("\0") &&
      linuxPath.startsWith("/");
    if (!distroOk || !pathOk) {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid WSL connection request." } };
    }
    try {
      const sup = getSupervisor(broadcast);
      const base = sup.resourceBase();
      // connect → hello (inside supervisor) → workspace.open(root).
      await sup.connect(distro, path.join(base, "node"), path.join(base, "helper.cjs"));
      console.error("[wsl-connect] hello ok, opening workspace", { distro, linuxPath });
      try {
        await sup.request("workspace.open", { root: linuxPath });
      } catch (openErr) {
        console.error("[wsl-connect] workspace.open failed", { distro, linuxPath, error: toHelperError(openErr) });
        sup.disconnect();
        return { ok: false, error: toHelperError(openErr) };
      }
      console.error("[wsl-connect] workspace.open ok", { distro, linuxPath });
      const reg = registry.register("windows-wsl", `${distro}:${linuxPath}`, linuxPath, distro);
      return { ok: true, result: { ...toWorkspaceInfo(reg), connection: "connected" as const } };
    } catch (err) {
      return { ok: false, error: { code: "DISCONNECTED", message: "Could not connect to WSL helper.", detail: String(err) } };
    }
  });

  ipcMain.handle("shell:reveal", async (event, workspaceId: unknown, relativePath: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const wid = validateWorkspaceId(workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    const reg = registry.get(wid.workspaceId);
    if (!reg || typeof relativePath !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid reveal request." } };
    }
    if (!isNativeWorkspace(reg)) {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Reveal is not supported in WSL workspaces in this version." } };
    }
    const v = validateNativeRel(reg.type, toCanonicalRel(relativePath));
    if ("error" in v) return { ok: false, error: v.error };
    const r = await resolveInsideRoot(reg.root, reg.type, v.relativePath);
    if ("error" in r) return { ok: false, error: r.error };
    // Native reveal: Explorer / Finder / File Manager (§32).
    shell.showItemInFolder(r.absolutePath);
    return { ok: true, result: null };
  });

  ipcMain.handle("directory:list", async (event, workspaceId: unknown, relativePath: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const wid = validateWorkspaceId(workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    const reg = registry.get(wid.workspaceId);
    if (!reg) return { ok: false, error: { code: "INVALID_REQUEST", message: "Unknown workspace." } };
    if (!isNativeWorkspace(reg)) {
      const v = normalizeWslRel(relativePath, true);
      if ("error" in v) return { ok: false, error: v.error };
      const sup = supervisor;
      if (!sup?.getSession()) return helperDisconnected();
      try {
        const entries = (await sup.request("directory.list", { relativePath: v.rel })) as DirectoryEntry[];
        return { ok: true, result: entries };
      } catch (err) {
        return { ok: false, error: toHelperError(err) };
      }
    }
    const rel = typeof relativePath === "string" ? toCanonicalRel(relativePath) : "";
    const out = await listDirectory(reg.root, reg.type, rel);
    if ("error" in out) return { ok: false, error: out.error };
    return { ok: true, result: out.entries };
  });

  ipcMain.handle("file:read", async (event, workspaceId: unknown, relativePath: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const wid = validateWorkspaceId(workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    const reg = registry.get(wid.workspaceId);
    if (!reg) return { ok: false, error: { code: "INVALID_REQUEST", message: "Unknown workspace." } };
    if (!isNativeWorkspace(reg)) {
      if (typeof relativePath !== "string") {
        return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid file read request." } };
      }
      const v = normalizeWslRel(relativePath, false);
      if ("error" in v) {
        console.error("[file-read] wsl rejected path", { workspaceId: wid.workspaceId, root: reg.root, distro: reg.distro, raw: relativePath, error: v.error });
        return { ok: false, error: v.error };
      }
      const sup = supervisor;
      if (!sup?.getSession()) {
        console.error("[file-read] wsl no helper session", { workspaceId: wid.workspaceId, root: reg.root, distro: reg.distro, relativePath: v.rel });
        return helperDisconnected();
      }
      console.error("[file-read] wsl request", {
        workspaceId: wid.workspaceId,
        root: reg.root,
        distro: reg.distro,
        sessionId: sup.getSession()?.sessionId,
        relativePath: v.rel,
      });
      try {
        const result = await sup.request("file.read", { relativePath: v.rel });
        const rev = (result as { revision?: { hash?: string; size?: number } }).revision;
        console.error("[file-read] wsl ok", { workspaceId: wid.workspaceId, relativePath: v.rel, hash: rev?.hash, size: rev?.size });
        return { ok: true, result };
      } catch (err) {
        console.error("[file-read] wsl helper error", {
          workspaceId: wid.workspaceId,
          root: reg.root,
          distro: reg.distro,
          sessionId: sup.getSession()?.sessionId,
          relativePath: v.rel,
          error: toHelperError(err),
        });
        return { ok: false, error: toHelperError(err) };
      }
    }
    if (typeof relativePath !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid file read request." } };
    }
    const out = await readTextFile(reg.root, reg.type, toCanonicalRel(relativePath));
    if ("error" in out) {
      console.error("[file-read] native error", { workspaceId: wid.workspaceId, kind: reg.type, root: reg.root, relativePath, error: out.error });
      return { ok: false, error: out.error };
    }
    return { ok: true, result: out.result };
  });

  ipcMain.handle("file:write", async (event, args: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const a = args as { workspaceId?: unknown; relativePath?: unknown; content?: unknown; expectedHash?: unknown; newlineStyle?: unknown; hadBom?: unknown };
    const wid = validateWorkspaceId(a?.workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    const reg = registry.get(wid.workspaceId);
    if (!reg) return { ok: false, error: { code: "INVALID_REQUEST", message: "Unknown workspace." } };
    if (!isNativeWorkspace(reg)) {
      if (typeof a?.relativePath !== "string" || typeof a?.content !== "string" || typeof a?.expectedHash !== "string") {
        return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid file write request." } };
      }
      const v = normalizeWslRel(a.relativePath, false);
      if ("error" in v) return { ok: false, error: v.error };
      const sup = supervisor;
      if (!sup?.getSession()) return helperDisconnected();
      try {
        const revision = await sup.request("file.write", {
          relativePath: v.rel,
          content: a.content,
          expectedHash: a.expectedHash,
          newlineStyle: a.newlineStyle === "crlf" ? "crlf" : "lf",
        });
        return { ok: true, result: revision };
      } catch (err) {
        return { ok: false, error: toHelperError(err) };
      }
    }
    if (typeof a?.relativePath !== "string" || typeof a?.content !== "string" || typeof a?.expectedHash !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid file write request." } };
    }
    const out = await writeTextFile(reg.root, reg.type, toCanonicalRel(a.relativePath), a.content, a.expectedHash, a.newlineStyle === "crlf" ? "crlf" : "lf", a.hadBom === true);
    if ("error" in out) return { ok: false, error: out.error };
    return { ok: true, result: out.revision };
  });

  ipcMain.handle("file:create", async (event, workspaceId: unknown, relativePath: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const wid = validateWorkspaceId(workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    const reg = registry.get(wid.workspaceId);
    if (!reg) return { ok: false, error: { code: "INVALID_REQUEST", message: "Unknown workspace." } };
    if (!isNativeWorkspace(reg)) {
      if (typeof relativePath !== "string") {
        return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid file create request." } };
      }
      const v = normalizeWslRel(relativePath, false);
      if ("error" in v) return { ok: false, error: v.error };
      const sup = supervisor;
      if (!sup?.getSession()) return helperDisconnected();
      try {
        const revision = await sup.request("file.create", { relativePath: v.rel });
        return { ok: true, result: revision };
      } catch (err) {
        return { ok: false, error: toHelperError(err) };
      }
    }
    if (typeof relativePath !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid file create request." } };
    }
    const out = await createTextFile(reg.root, reg.type, toCanonicalRel(relativePath));
    if ("error" in out) return { ok: false, error: out.error };
    return { ok: true, result: out.revision };
  });

  ipcMain.handle("file:rename", async (event, workspaceId: unknown, oldPath: unknown, newPath: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const wid = validateWorkspaceId(workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    const reg = registry.get(wid.workspaceId);
    if (!reg || typeof oldPath !== "string" || typeof newPath !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid rename request." } };
    }
    if (!isNativeWorkspace(reg)) {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Rename is not supported in WSL workspaces in this version." } };
    }
    const out = await renamePath(reg.root, reg.type, toCanonicalRel(oldPath), toCanonicalRel(newPath));
    if ("error" in out) return { ok: false, error: out.error };
    return { ok: true, result: null };
  });

  ipcMain.handle("file:trash", async (event, workspaceId: unknown, relativePath: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const wid = validateWorkspaceId(workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    const reg = registry.get(wid.workspaceId);
    if (!reg || typeof relativePath !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid trash request." } };
    }
    if (!isNativeWorkspace(reg)) {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Trash is not supported in WSL workspaces in this version." } };
    }
    const v = validateNativeRel(reg.type, toCanonicalRel(relativePath));
    if ("error" in v) return { ok: false, error: v.error };
    const r = await resolveInsideRoot(reg.root, reg.type, v.relativePath);
    if ("error" in r) return { ok: false, error: r.error };
    try {
      // OS trash semantics (Recycle Bin / Trash) via Electron (§30).
      await shell.trashItem(r.absolutePath);
    } catch (err) {
      return { ok: false, error: { code: "INTERNAL_ERROR", message: "Could not move to trash.", detail: String(err) } };
    }
    return { ok: true, result: null };
  });

  ipcMain.handle("search:files", async (event, workspaceId: unknown, query: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const wid = validateWorkspaceId(workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    const reg = registry.get(wid.workspaceId);
    if (!reg || typeof query !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid search request." } };
    }
    if (!isNativeWorkspace(reg)) {
      const sup = supervisor;
      if (!sup?.getSession()) return helperDisconnected();
      try {
        const matches = await searchWslWorkspace(sup, { query, includeFilenames: true, includeContent: false, maxResults: 200 });
        return { ok: true, result: matches };
      } catch (err) {
        return { ok: false, error: toHelperError(err) };
      }
    }
    const matches = await searchWorkspace(reg.root, { query, includeFilenames: true, includeContent: false, maxResults: 200 });
    return { ok: true, result: matches };
  });

  ipcMain.handle("search:content", async (event, workspaceId: unknown, query: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const wid = validateWorkspaceId(workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    const reg = registry.get(wid.workspaceId);
    if (!reg || typeof query !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid search request." } };
    }
    if (!isNativeWorkspace(reg)) {
      const sup = supervisor;
      if (!sup?.getSession()) return helperDisconnected();
      try {
        const matches = await searchWslWorkspace(sup, { query, includeFilenames: false, includeContent: true, maxResults: 1000 });
        return { ok: true, result: matches };
      } catch (err) {
        return { ok: false, error: toHelperError(err) };
      }
    }
    const matches = await searchWorkspace(reg.root, { query, includeFilenames: false, includeContent: true, maxResults: 1000 });
    return { ok: true, result: matches };
  });

  ipcMain.handle("app:version", () => ({ ok: true, result: app.getVersion() }));

  // Crash-recovery drafts (never a substitute for `Saved`: the renderer keeps
  // `Saved` strictly for bytes that reached the note file). Drafts live under
  // userData, outside every note workspace.
  ipcMain.handle("draft:put", async (event, args: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const v = validateDraftPut(args);
    if ("error" in v) return { ok: false, error: v.error };
    const reg = registry.get(v.workspaceId);
    if (!reg) return { ok: false, error: { code: "INVALID_REQUEST", message: "Unknown workspace." } };
    const out = await saveDraft(draftsBaseDir(), {
      workspaceType: reg.type,
      workspaceRoot: reg.root,
      distro: reg.distro,
      workspaceDisplayName: reg.displayName,
      relativePath: v.relativePath,
      baseRevisionHash: v.baseRevisionHash,
      content: v.content,
    });
    if (!out.ok) return { ok: false, error: { code: "INTERNAL_ERROR", message: "Could not persist draft." } };
    return { ok: true, result: null };
  });

  ipcMain.handle("draft:get", async (event, workspaceId: unknown, relativePath: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const wid = validateWorkspaceId(workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    const reg = registry.get(wid.workspaceId);
    if (!reg || typeof relativePath !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid draft request." } };
    }
    const draft = await loadDraft(draftsBaseDir(), {
      workspaceType: reg.type,
      workspaceRoot: reg.root,
      distro: reg.distro,
      relativePath: toCanonicalRel(relativePath),
    });
    if (!draft) return { ok: true, result: null };
    return {
      ok: true,
      result: {
        content: draft.content,
        baseRevisionHash: draft.baseRevisionHash,
        updatedAt: draft.updatedAt,
        stale: isDraftStale(draft),
      },
    };
  });

  ipcMain.handle("draft:clear", async (event, workspaceId: unknown, relativePath: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const wid = validateWorkspaceId(workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    const reg = registry.get(wid.workspaceId);
    if (!reg || typeof relativePath !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid draft request." } };
    }
    await clearDraft(draftsBaseDir(), {
      workspaceType: reg.type,
      workspaceRoot: reg.root,
      distro: reg.distro,
      relativePath: toCanonicalRel(relativePath),
    });
    return { ok: true, result: null };
  });
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
