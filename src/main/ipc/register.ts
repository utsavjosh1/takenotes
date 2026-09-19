import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { createMainWindow, resolveRendererDir } from "../window.js";
import { WorkspaceRegistry, isNativeWorkspace, toWorkspaceInfo, type WorkspaceRegistration } from "../workspace/registry.js";
import { resolveInsideRoot } from "../workspace/local-workspace.js";
import { NativeFileAdapter } from "../workspace/file-adapter.js";
import { WorkspaceService } from "../services/workspace-service.js";
import { NoteService } from "../services/note-service.js";
import { validatePosixRelativePath, validateWindowsRelativePath } from "../workspace/path-security.js";
import { validateWorkspaceId } from "../workspace/path-security.js";
import type { WorkspaceKind } from "../../shared/platform/types.js";
import { clearDraft, isDraftStale, loadDraft, MAX_DRAFT_BYTES, saveDraft } from "../workspace/drafts.js";
import { HelperSupervisor } from "../wsl/helper-supervisor.js";
import { isValidDistroId, isValidLinuxUser } from "../wsl/launch-security.js";
import { listWslUsers } from "../wsl/user-discovery.js";
import { checkForUpdates, downloadAndInstall } from "../update/updater.js";
import { currentDesktopPlatform } from "../../shared/platform/platform.js";
import { getCapabilities } from "../../shared/platform/capabilities.js";
import { localWorkspaceKind, toCanonicalRel } from "../../shared/platform/filesystem.js";
import { shortcutLabelsFor } from "../../shared/platform/shortcut-labels.js";
import { commandService } from "../services/command-service.js";
import { detectWayland } from "../platform/linux.js";
import type { PlatformReport, WslLinuxUser } from "../../shared/contracts/ipc.js";
import type { AppError } from "../../shared/errors.js";
import { toHelperError } from "./helper-errors.js";

const workspaces = new WorkspaceService(
  new WorkspaceRegistry(),
  undefined,
  // Ephemeral discovery session (default user, no workspace opened) for
  // exactly one explicitly selected distro. Never disturbs the singleton
  // connect session owned below. The supervisor is created lazily once the
  // IPC broadcast channel exists (see registerIpc).
  async (distro: string): Promise<WslLinuxUser[]> => {
    const sup = getSupervisor(broadcastEvent ?? (() => undefined));
    const base = sup.resourceBase();
    const ephemeral = await sup.spawnEphemeral(distro, path.join(base, "node"), path.join(base, "helper.cjs"));
    return listWslUsers(distro, {
      spawnSession: async () => ({
        request: (operation, payload) => ephemeral.request(operation, payload),
        dispose: () => ephemeral.dispose(),
      }),
    });
  },
);
// Single native adapter for Windows/macOS/Linux local workspaces.
const nativeAdapter = new NativeFileAdapter((absolutePath) => shell.trashItem(absolutePath));
let supervisor: HelperSupervisor | null = null;
/** Broadcast channel for WSL state events, captured per registerIpc call. */
let broadcastEvent: ((kind: string, payload: unknown) => void) | null = null;
// NoteService dispatches by workspace kind: native → FileAdapter, WSL → helper.
let notes: NoteService | null = null;

function getNotes(): NoteService {
  if (!notes) {
    notes = new NoteService(workspaces, {
      native: nativeAdapter,
      wslRequest: (operation, params, identity) => {
        const sup = supervisor;
        if (!sup) throw { code: "DISCONNECTED", message: "WSL helper is not connected." };
        const active = sup.getSession();
        if (!active) throw { code: "DISCONNECTED", message: "WSL helper is not connected." };
        // Session identity guard (P1-04, ADR-0007): the helper is keyed by
        // distro + linuxUser, never distro alone. A mutation for
        // Ubuntu/work must never execute on an Ubuntu/utsav session — fail
        // closed with DISCONNECTED (reconnect as the right user) instead of
        // running as the wrong Linux user. No sudo, no retry-as-other-user.
        if (
          (identity.distro !== undefined && active.distro !== identity.distro) ||
          (identity.linuxUser !== undefined && active.linuxUser !== identity.linuxUser)
        ) {
          throw {
            code: "DISCONNECTED",
            message: `WSL session is connected as ${active.distro}/${active.linuxUser}, not as ${identity.distro ?? "?"}/${identity.linuxUser ?? "?"}. Reconnect the workspace.`,
          };
        }
        return sup.request(operation, params) as Promise<unknown>;
      },
      hasWslSession: () => supervisor?.getSession() != null,
    });
  }
  return notes;
}

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

/** Canonicalize a renderer-supplied path for a resolved workspace (native
 * kinds via `toCanonicalRel`, WSL via wire validation). Deep validation
 * lives in the service/adapter layers; this only normalizes the wire shape. */
function handlerRel(
  reg: WorkspaceRegistration,
  input: string,
  allowEmpty: boolean,
): { rel: string } | { error: AppError } {
  if (isNativeWorkspace(reg)) return { rel: toCanonicalRel(input) };
  return normalizeWslRel(input, allowEmpty);
}

export function registerIpc(broadcast: (kind: string, payload: unknown) => void): void {
  broadcastEvent = broadcast;
  // Platform report for the renderer hook + `npm run test:platform` (§210).
  // Uses app.getPath — never hardcoded platform paths (§19–§20, §100–§102).
  ipcMain.handle("app:platform", () => {
    const platform = currentDesktopPlatform();
    const report: PlatformReport = {
      platform,
      arch: process.arch,
      capabilities: {
        wsl: getCapabilities(platform).wsl,
        updates: getCapabilities(platform).updates,
        macTrafficLights: getCapabilities(platform).macTrafficLights,
        supportsWayland: getCapabilities(platform).supportsWayland,
      },
      workspaceKind: localWorkspaceKind(platform),
      wayland: platform === "linux" ? detectWayland() : false,
      shortcuts: shortcutLabelsFor(platform),
    };
    return { ok: true, result: report };
  });

  ipcMain.handle("commands:list", (event) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    return { ok: true, result: commandService.list() };
  });

  ipcMain.handle("workspace:openLocal", async (event) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const win = BrowserWindow.fromWebContents(event.sender)!;
    // Native Explorer / Finder / desktop file picker (§17, §160).
    const result = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
    if (result.canceled || result.filePaths.length === 0) return { ok: true, result: null };
    const root = result.filePaths[0]!;
    const reg = workspaces.registerLocal(path.basename(root), root, localWorkspaceKind(currentDesktopPlatform()));
    return { ok: true, result: { ...toWorkspaceInfo(reg), connection: "connected" as const } };
  });

  ipcMain.handle("workspace:close", async (event, workspaceId: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const v = validateWorkspaceId(workspaceId);
    if ("error" in v) return { ok: false, error: v.error };
    const reg = workspaces.get(v.workspaceId);
    if (reg && !isNativeWorkspace(reg) && supervisor?.getSession()) {
      // Best-effort: release the helper-side root; registry close always runs.
      try {
        await supervisor.request("workspace.close", {});
      } catch {
        /* helper already gone — registry is the source of truth */
      }
    }
    workspaces.close(v.workspaceId);
    return { ok: true, result: null };
  });

  ipcMain.handle("workspace:listWsl", async (event) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const gate = requireWslCapable();
    if (!gate.ok) return gate;
    // Validate sender + platform, then delegate to the WorkspaceService seam.
    try {
      const distros = await workspaces.listDistributions();
      return { ok: true, result: distros };
    } catch (err) {
      return { ok: false, error: { code: "INTERNAL_ERROR", message: "WSL is not available.", detail: String(err) } };
    }
  });

  ipcMain.handle("wsl:connect", async (event, distro: unknown, linuxUser: unknown, linuxPath: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const gate = requireWslCapable();
    if (!gate.ok) return gate;
    // Distro/user names travel as spawn argv (shell:false) and into UI text:
    // constrain them to plausible identifiers before any use. The Linux user
    // comes from the picker's `users.list` discovery — never guessed, never
    // the Windows username. No sudo/escalation: `-u` runs with that user's
    // own permissions (ADR-0007).
    if (!isValidDistroId(distro) || !isValidLinuxUser(linuxUser)) {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid WSL connection request." } };
    }
    // Absolute POSIX root, or `~`-anchored (expanded in the helper under the
    // selected user — never on Windows). Validate before connect so a bad
    // root never leaves behind a connected-but-useless session.
    const pathOk =
      typeof linuxPath === "string" &&
      linuxPath.length >= 1 &&
      linuxPath.length <= 1024 &&
      !linuxPath.includes("\0") &&
      (linuxPath.startsWith("/") || linuxPath === "~" || linuxPath.startsWith("~/"));
    if (!pathOk) {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid WSL connection request." } };
    }
    try {
      const sup = getSupervisor(broadcast);
      const base = sup.resourceBase();
      // connect (-u linuxUser) → hello (inside supervisor) → workspace.open(root).
      await sup.connect(distro, linuxUser, path.join(base, "node"), path.join(base, "helper.cjs"));
      console.error("[wsl-connect] hello ok, opening workspace", { distro, linuxUser, linuxPath });
      let openedRoot: string;
      try {
        const opened = (await sup.request("workspace.open", { root: linuxPath })) as { root?: unknown };
        if (!opened || typeof opened.root !== "string") throw { code: "INTERNAL_ERROR", message: "Workspace did not open." };
        openedRoot = opened.root;
      } catch (openErr) {
        console.error("[wsl-connect] workspace.open failed", { distro, linuxUser, linuxPath, error: toHelperError(openErr) });
        sup.disconnect();
        return { ok: false, error: toHelperError(openErr) };
      }
      console.error("[wsl-connect] workspace.open ok", { distro, linuxUser, linuxPath, openedRoot });
      const reg = workspaces.registerWsl(`${distro}:${linuxUser}:${linuxPath}`, openedRoot, distro, linuxUser);
      return { ok: true, result: { ...toWorkspaceInfo(reg), connection: "connected" as const } };
    } catch (err) {
      return { ok: false, error: { code: "DISCONNECTED", message: "Could not connect to WSL helper.", detail: String(err) } };
    }
  });

  ipcMain.handle("workspace:listWslUsers", async (event, distro: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const gate = requireWslCapable();
    if (!gate.ok) return gate;
    if (!isValidDistroId(distro)) {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Unknown distribution." } };
    }
    // Validate against the discovered set when listing works. A listing
    // failure falls through — discovery below surfaces its own precise error.
    try {
      const known = await workspaces.listDistributions();
      if (!known.some((d) => d.name === distro)) {
        return { ok: false, error: { code: "INVALID_REQUEST", message: "Unknown distribution." } };
      }
    } catch {
      /* discovery below reports precisely */
    }
    // Validate sender + distro, then delegate to the WorkspaceService seam.
    // Only the explicitly selected distro is entered (as its default user);
    // unrelated distros are never woken.
    try {
      const users = await workspaces.listUsers(distro);
      return { ok: true, result: users };
    } catch (err) {
      return { ok: false, error: toHelperError(err) };
    }
  });

  ipcMain.handle("shell:reveal", async (event, workspaceId: unknown, relativePath: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const wid = validateWorkspaceId(workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    const reg = workspaces.get(wid.workspaceId);
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

  // Thin IPC seam (ADR-0009): validate sender + wire shapes, then delegate
  // to NoteService. No filesystem logic lives in these handlers.
  ipcMain.handle("directory:list", async (event, workspaceId: unknown, relativePath: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const wid = validateWorkspaceId(workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    if (typeof relativePath !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid directory request." } };
    }
    const reg = workspaces.get(wid.workspaceId);
    if (!reg) return { ok: false, error: { code: "INVALID_REQUEST", message: "Unknown workspace." } };
    const prep = handlerRel(reg, relativePath, true);
    if ("error" in prep) return { ok: false, error: prep.error };
    const out = await getNotes().listTree(wid.workspaceId, prep.rel);
    if ("error" in out) return { ok: false, error: out.error };
    return { ok: true, result: out.entries };
  });

  ipcMain.handle("directory:create", async (event, workspaceId: unknown, relativePath: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const wid = validateWorkspaceId(workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    if (typeof relativePath !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid directory request." } };
    }
    const reg = workspaces.get(wid.workspaceId);
    if (!reg) return { ok: false, error: { code: "INVALID_REQUEST", message: "Unknown workspace." } };
    const prep = handlerRel(reg, relativePath, false);
    if ("error" in prep) return { ok: false, error: prep.error };
    const rel = prep.rel;
    const out = await getNotes().createDirectory(wid.workspaceId, rel);
    if ("error" in out) return { ok: false, error: out.error };
    return { ok: true, result: null };
  });

  ipcMain.handle("directory:rename", async (event, workspaceId: unknown, oldPath: unknown, newPath: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const wid = validateWorkspaceId(workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    if (typeof oldPath !== "string" || typeof newPath !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid rename request." } };
    }
    const reg = workspaces.get(wid.workspaceId);
    if (!reg) return { ok: false, error: { code: "INVALID_REQUEST", message: "Unknown workspace." } };
    if (!isNativeWorkspace(reg)) {
      const vOld = normalizeWslRel(oldPath, false);
      if ("error" in vOld) return { ok: false, error: vOld.error };
      const vNew = normalizeWslRel(newPath, false);
      if ("error" in vNew) return { ok: false, error: vNew.error };
      const out = await getNotes().renameDirectory(wid.workspaceId, vOld.rel, vNew.rel);
      if ("error" in out) return { ok: false, error: out.error };
      return { ok: true, result: null };
    }
    const out = await getNotes().renameDirectory(wid.workspaceId, toCanonicalRel(oldPath), toCanonicalRel(newPath));
    if ("error" in out) return { ok: false, error: out.error };
    return { ok: true, result: null };
  });

  ipcMain.handle("directory:delete", async (event, workspaceId: unknown, relativePath: unknown, recursive: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const wid = validateWorkspaceId(workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    if (typeof relativePath !== "string" || (typeof recursive !== "boolean" && typeof recursive !== "undefined")) {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid directory request." } };
    }
    const reg = workspaces.get(wid.workspaceId);
    if (!reg) return { ok: false, error: { code: "INVALID_REQUEST", message: "Unknown workspace." } };
    const prep = handlerRel(reg, relativePath, false);
    if ("error" in prep) return { ok: false, error: prep.error };
    const rel = prep.rel;
    const out = await getNotes().deleteDirectory(wid.workspaceId, rel, recursive === true);
    if ("error" in out) return { ok: false, error: out.error };
    return { ok: true, result: null };
  });

  ipcMain.handle("file:read", async (event, workspaceId: unknown, relativePath: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const wid = validateWorkspaceId(workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    if (typeof relativePath !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid file read request." } };
    }
    const reg = workspaces.get(wid.workspaceId);
    if (!reg) return { ok: false, error: { code: "INVALID_REQUEST", message: "Unknown workspace." } };
    const prep = handlerRel(reg, relativePath, false);
    if ("error" in prep) return { ok: false, error: prep.error };
    const rel = prep.rel;
    const out = await getNotes().readFile(wid.workspaceId, rel);
    if ("error" in out) return { ok: false, error: out.error };
    return { ok: true, result: out.result };
  });

  ipcMain.handle("file:write", async (event, args: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const a = args as { workspaceId?: unknown; relativePath?: unknown; content?: unknown; expectedHash?: unknown; newlineStyle?: unknown; hadBom?: unknown };
    const wid = validateWorkspaceId(a?.workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    if (typeof a?.relativePath !== "string" || typeof a?.content !== "string" || typeof a?.expectedHash !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid file write request." } };
    }
    const reg = workspaces.get(wid.workspaceId);
    if (!reg) return { ok: false, error: { code: "INVALID_REQUEST", message: "Unknown workspace." } };
    const prep = handlerRel(reg, a.relativePath, false);
    if ("error" in prep) return { ok: false, error: prep.error };
    const rel = prep.rel;
    const out = await getNotes().writeFile(wid.workspaceId, rel, a.content, a.expectedHash, a.newlineStyle === "crlf" ? "crlf" : "lf", a.hadBom === true);
    if ("error" in out) return { ok: false, error: out.error };
    return { ok: true, result: out.revision };
  });

  ipcMain.handle("file:create", async (event, workspaceId: unknown, relativePath: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const wid = validateWorkspaceId(workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    if (typeof relativePath !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid file create request." } };
    }
    const reg = workspaces.get(wid.workspaceId);
    if (!reg) return { ok: false, error: { code: "INVALID_REQUEST", message: "Unknown workspace." } };
    const prep = handlerRel(reg, relativePath, false);
    if ("error" in prep) return { ok: false, error: prep.error };
    const rel = prep.rel;
    const out = await getNotes().createFile(wid.workspaceId, rel);
    if ("error" in out) return { ok: false, error: out.error };
    return { ok: true, result: out.revision };
  });

  ipcMain.handle("file:rename", async (event, workspaceId: unknown, oldPath: unknown, newPath: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const wid = validateWorkspaceId(workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    if (typeof oldPath !== "string" || typeof newPath !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid rename request." } };
    }
    const reg = workspaces.get(wid.workspaceId);
    if (!reg) return { ok: false, error: { code: "INVALID_REQUEST", message: "Unknown workspace." } };
    if (!isNativeWorkspace(reg)) {
      const vOld = normalizeWslRel(oldPath, false);
      if ("error" in vOld) return { ok: false, error: vOld.error };
      const vNew = normalizeWslRel(newPath, false);
      if ("error" in vNew) return { ok: false, error: vNew.error };
      const out = await getNotes().renamePath(wid.workspaceId, vOld.rel, vNew.rel);
      if ("error" in out) return { ok: false, error: out.error };
      return { ok: true, result: null };
    }
    const out = await getNotes().renamePath(wid.workspaceId, toCanonicalRel(oldPath), toCanonicalRel(newPath));
    if ("error" in out) return { ok: false, error: out.error };
    return { ok: true, result: null };
  });

  ipcMain.handle("file:trash", async (event, workspaceId: unknown, relativePath: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const wid = validateWorkspaceId(workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    if (typeof relativePath !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid trash request." } };
    }
    const reg = workspaces.get(wid.workspaceId);
    if (!reg) return { ok: false, error: { code: "INVALID_REQUEST", message: "Unknown workspace." } };
    // WSL trash is permanent-delete in P1 (helper `file.delete`): the wire
    // shape is validated exactly like every other WSL mutation — main
    // validates the shape only, confinement lives in the helper.
    const prep = handlerRel(reg, relativePath, false);
    if ("error" in prep) return { ok: false, error: prep.error };
    const rel = isNativeWorkspace(reg) ? toCanonicalRel(prep.rel) : prep.rel;
    const out = await getNotes().trashPath(wid.workspaceId, rel);
    if ("error" in out) return { ok: false, error: out.error };
    return { ok: true, result: null };
  });

  // Search V1 (P1-08) runs renderer-side over the P1-07 in-memory index —
  // no filesystem walk per query. The old `search:*` scan handlers were
  // removed with the scan module, not kept in parallel.

  ipcMain.handle("app:version", () => ({ ok: true, result: app.getVersion() }));

  // In-app software updates, Windows-only (ADR-0006). Parked platforms get
  // a precise NOT SUPPORTED-style error, never a generic failure.
  ipcMain.handle("update:check", async (event, manual: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    return checkForUpdates(manual === true);
  });

  ipcMain.handle("update:download", async (event) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    return downloadAndInstall((progress) => broadcast("update-progress", progress));
  });

  // Crash-recovery drafts (never a substitute for `Saved`: the renderer keeps
  // `Saved` strictly for bytes that reached the note file). Drafts live under
  // userData, outside every note workspace.
  ipcMain.handle("draft:put", async (event, args: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const v = validateDraftPut(args);
    if ("error" in v) return { ok: false, error: v.error };
    const reg = workspaces.get(v.workspaceId);
    if (!reg) return { ok: false, error: { code: "INVALID_REQUEST", message: "Unknown workspace." } };
    const out = await saveDraft(draftsBaseDir(), {
      workspaceType: reg.type,
      workspaceRoot: reg.root,
      distro: reg.distro,
      linuxUser: reg.linuxUser,
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
    const reg = workspaces.get(wid.workspaceId);
    if (!reg || typeof relativePath !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid draft request." } };
    }
    const draft = await loadDraft(draftsBaseDir(), {
      workspaceType: reg.type,
      workspaceRoot: reg.root,
      distro: reg.distro,
      linuxUser: reg.linuxUser,
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
    const reg = workspaces.get(wid.workspaceId);
    if (!reg || typeof relativePath !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid draft request." } };
    }
    await clearDraft(draftsBaseDir(), {
      workspaceType: reg.type,
      workspaceRoot: reg.root,
      distro: reg.distro,
      linuxUser: reg.linuxUser,
      relativePath: toCanonicalRel(relativePath),
    });
    return { ok: true, result: null };
  });
}

export function createWindowIpc(): void {
  // Packaged anchor: app.getAppPath() is `.../resources/app.asar`, so
  // `dist/renderer` resolves with no depth assumption. Legacy `__dirname`
  // traversal is the fallback (dev runs VITE_DEV_SERVER_URL anyway).
  const win = createMainWindow(
    path.join(__dirname, "..", "preload", "index.cjs"),
    process.env["VITE_DEV_SERVER_URL"] ?? null,
    resolveRendererDir({
      appPath: (() => {
        try {
          return app.getAppPath();
        } catch {
          return "";
        }
      })(),
      mainDir: __dirname,
      exists: (p: string) => {
        try {
          return existsSync(p);
        } catch {
          return false;
        }
      },
    }),
  );
  registerIpc((kind, payload) => {
    if (!win.isDestroyed()) win.webContents.send(`takenotes:${kind}`, payload);
  });
}
