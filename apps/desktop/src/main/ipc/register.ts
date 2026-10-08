import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createMainWindow, resolveRendererDir } from "../window.js";
import { WorkspaceRegistry, isNativeWorkspace, toWorkspaceInfo, type WorkspaceRegistration } from "../workspace/registry.js";
import { MAX_IMPORT_BYTES, resolveInsideRoot } from "../workspace/local-workspace.js";
import { NativeFileAdapter } from "../workspace/file-adapter.js";
import { NativeWorkspaceWatcher } from "../workspace/native-watch.js";
import { WorkspaceService } from "../services/workspace-service.js";
import { NoteService } from "../services/note-service.js";
import { DailyService } from "../services/daily-service.js";
import { validatePosixRelativePath, validateWindowsRelativePath } from "../workspace/path-security.js";
import { validateWorkspaceId } from "../workspace/path-security.js";
import type { WorkspaceKind } from "@takenotes/platform/types";
import { clearDraft, isDraftStale, loadDraft, MAX_DRAFT_BYTES, saveDraft } from "../workspace/drafts.js";
import { RecoveryStore, recoveryKeyForWorkspace } from "../workspace/recovery.js";
import { HelperSupervisor } from "../wsl/helper-supervisor.js";
import { WslRuntimeSupervisor } from "../wsl/runtime-supervisor.js";
import { ConnectionStore, connectionStatusForHelperState } from "../wsl/connections.js";
import { isValidDistroId, isValidLinuxUser } from "../wsl/launch-security.js";
import { listWslUsers } from "../wsl/user-discovery.js";
import { checkForUpdates, downloadAndInstall } from "../update/updater.js";
import { currentDesktopPlatform } from "@takenotes/platform/platform";
import { getCapabilities } from "@takenotes/platform/capabilities";
import { localWorkspaceKind, toCanonicalRel } from "@takenotes/platform/filesystem";
import { shortcutLabelsFor } from "@takenotes/platform/shortcut-labels";
import { commandService } from "../services/command-service.js";
import { detectWayland } from "../platform/linux.js";
import { frameStylePath, parseFrameStyle, readFrameStyleFile, serializeFrameStyle } from "../platform/frame-style.js";
import type { PlatformReport, RecentWorkspaceInfo, WslLinuxUser } from "@takenotes/contracts/ipc";
import type { AppError } from "@takenotes/contracts/errors";
import type { McpActivityLog } from "@takenotes/core/mcp/activity";
import type { McpGrantStore } from "@takenotes/core/mcp/grants";
import { grantAccess, revokeAccess, revokeClient } from "@takenotes/core/mcp/grants";
import { createImportRunner, type ImportRunner } from "../import/runner.js";
import { createMcpPorts } from "../services/mcp-host.js";
import { startMcpPipeServer, type McpPipeServer } from "../services/mcp-pipe.js";
import { appendMcpActivity, loadMcpActivity, loadMcpGrants, saveMcpGrants } from "../services/mcp-store.js";
import { toHelperError } from "./helper-errors.js";
import { isTrustedWindow } from "./guard.js";

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
let runtimeSupervisor: WslRuntimeSupervisor | null = null;
/** Explicit Connection records (7b, ADR-0007): one connection → many
 * workspaces. The singleton transports still own readiness; this store owns
 * identity + status. Module-owned alongside the transports it tracks. */
const connections = new ConnectionStore();
/** Connection key of the live singleton session (if any). State callbacks
 * project supervisor transitions onto this record. */
let activeConnectionKey: string | null = null;
/** Broadcast channel for WSL state events, captured per registerIpc call. */
let broadcastEvent: ((kind: string, payload: unknown) => void) | null = null;
// NoteService dispatches by workspace kind: native → FileAdapter, WSL → runtime/helper.
let notes: NoteService | null = null;
let daily: DailyService | null = null;
let recoveryStore: RecoveryStore | null = null;
let nativeWatcher: NativeWorkspaceWatcher | null = null;
// MCP automation state (Step 8): grants + activity live in app-data `mcp/`
// (never in workspaces). The pipe server holds the live store objects so
// the approval screen mutates the same grants dispatch checks.
let importRunner: ImportRunner | null = null;

function getImportRunner(): ImportRunner {
  importRunner ??= createImportRunner({ workspaces, notes: getNotes() });
  return importRunner;
}

let mcpGrants: McpGrantStore | null = null;
let mcpLog: McpActivityLog | null = null;
let mcpPipe: McpPipeServer | null = null;

function mcpDir(): string {
  return path.join(app.getPath("userData"), "mcp");
}

async function mcpState(): Promise<{ grants: McpGrantStore; log: McpActivityLog }> {
  if (!mcpGrants) mcpGrants = await loadMcpGrants(mcpDir());
  if (!mcpLog) mcpLog = await loadMcpActivity(mcpDir());
  return { grants: mcpGrants, log: mcpLog };
}

function validateMcpClientId(input: unknown): { clientId: string } | { error: AppError } {
  if (typeof input !== "string" || !input.trim() || input.trim().length > 256) {
    return { error: { code: "INVALID_REQUEST", message: "Client id must be a non-empty string." } as AppError };
  }
  return { clientId: input.trim() };
}

/** Sidecar command shown in Settings → Automation. Packaged installs
 * read the bundle from resources; dev runs it from dist-mcp. Either
 * way the client needs a system node (`node <bundle>`). */
function mcpSidecarCommand(): string {
  const bundle = app.isPackaged
    ? path.join(process.resourcesPath, "mcp", "takenotes-mcp.cjs")
    : path.resolve("dist-mcp", "takenotes-mcp.cjs");
  return `node "${bundle}"`;
}

function watcher(): NativeWorkspaceWatcher {
  nativeWatcher ??= new NativeWorkspaceWatcher(nativeAdapter, (payload) => broadcastEvent?.("workspace-change", payload));
  return nativeWatcher;
}

function getDaily(): DailyService {
  daily ??= new DailyService(workspaces, getNotes());
  return daily;
}

function getNotes(): NoteService {
  if (!notes) {
    notes = new NoteService(workspaces, {
      native: nativeAdapter,
      wslRequest: (operation, params, identity) => {
        const runtime = runtimeSupervisor;
        const activeRuntime = runtime?.getSession() ?? null;
        if (runtime && activeRuntime) {
          if (
            (identity.distro !== undefined && activeRuntime.distro !== identity.distro) ||
            (identity.linuxUser !== undefined && activeRuntime.linuxUser !== identity.linuxUser)
          ) {
            throw {
              code: "DISCONNECTED",
              message: `WSL runtime is connected as ${activeRuntime.distro}/${activeRuntime.linuxUser}, not as ${identity.distro ?? "?"}/${identity.linuxUser ?? "?"}. Reconnect the workspace.`,
            };
          }
          return runtime.request(operation, params) as Promise<unknown>;
        }

        const sup = supervisor;
        if (!sup) throw { code: "DISCONNECTED", message: "WSL runtime/helper is not connected." };
        const active = sup.getSession();
        if (!active) throw { code: "DISCONNECTED", message: "WSL runtime/helper is not connected." };
        // Session identity guard (P1-04, ADR-0007): the transport is keyed by
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
      hasWslSession: () => runtimeSupervisor?.getSession() != null || supervisor?.getSession() != null,
    });
  }
  return notes;
}

function getSupervisor(onEvent: (kind: string, payload: unknown) => void): HelperSupervisor {
  if (!supervisor) {
    supervisor = new HelperSupervisor(
      (state) => {
        // Project supervisor transitions onto the Connection record (7b).
        // String `wsl-state` payload is unchanged (renderer contract).
        if (activeConnectionKey) connections.setStatusByKey(activeConnectionKey, connectionStatusForHelperState(state));
        onEvent("wsl-state", state);
      },
      (line) => console.error(`[wsl-helper] ${line}`),
    );
  }
  return supervisor;
}

function getRuntimeSupervisor(onEvent: (kind: string, payload: unknown) => void): WslRuntimeSupervisor {
  if (!runtimeSupervisor) {
    runtimeSupervisor = new WslRuntimeSupervisor(
      (state) => {
        if (activeConnectionKey) connections.setStatusByKey(activeConnectionKey, connectionStatusForHelperState(state));
        onEvent("wsl-state", state);
      },
      (line) => console.error(line),
    );
  }
  return runtimeSupervisor;
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
  return isTrustedWindow(win);
}

/** Draft storage root: outside every note workspace, under the Electron profile. */
function draftsBaseDir(): string {
  return app.getPath("userData");
}

function recovery(): RecoveryStore {
  recoveryStore ??= new RecoveryStore(app.getPath("userData"));
  return recoveryStore;
}

type RecentWorkspaceRecord = RecentWorkspaceInfo & { root: string };
const RECENT_WORKSPACES_FILE = "recent-workspaces.json";
const MAX_RECENT_WORKSPACES = 8;

function recentId(kind: WorkspaceKind, root: string): string {
  return createHash("sha256").update(`${kind}\0${path.resolve(root)}`).digest("hex").slice(0, 24);
}

function recentsPath(): string {
  return path.join(app.getPath("userData"), RECENT_WORKSPACES_FILE);
}

function readRecentWorkspaces(): RecentWorkspaceRecord[] {
  try {
    const parsed = JSON.parse(readFileSync(recentsPath(), "utf8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): RecentWorkspaceRecord[] => {
      const r = item as Partial<RecentWorkspaceRecord>;
      if (typeof r.id !== "string" || typeof r.displayName !== "string" || typeof r.root !== "string") return [];
      if (r.type !== "windows-local" && r.type !== "macos-local" && r.type !== "linux-local") return [];
      return [{ id: r.id, displayName: r.displayName, type: r.type, root: r.root }];
    }).slice(0, MAX_RECENT_WORKSPACES);
  } catch {
    return [];
  }
}

function writeRecentWorkspaces(records: RecentWorkspaceRecord[]): void {
  try {
    mkdirSync(path.dirname(recentsPath()), { recursive: true });
    writeFileSync(recentsPath(), `${JSON.stringify(records.slice(0, MAX_RECENT_WORKSPACES), null, 2)}\n`);
  } catch {
    /* recents are convenience only */
  }
}

function rememberLocalWorkspace(reg: WorkspaceRegistration): void {
  if (!isNativeWorkspace(reg)) return;
  const record: RecentWorkspaceRecord = {
    id: recentId(reg.type, reg.root),
    displayName: reg.displayName,
    type: reg.type,
    root: reg.root,
  };
  writeRecentWorkspaces([record, ...readRecentWorkspaces().filter((r) => r.id !== record.id)]);
}

function publicRecentWorkspaces(): RecentWorkspaceInfo[] {
  return readRecentWorkspaces().map(({ id, displayName, type }) => ({ id, displayName, type }));
}

/** Resolve a renderer-supplied workspaceId to its stable recovery namespace
 * (H-01). The runtime id is random per open; the namespace (`kind + root +
 * distro + linuxUser`) survives restarts, so history follows the Workspace
 * instead of the ephemeral id. */
function recoveryNamespace(reg: WorkspaceRegistration): string {
  return recoveryKeyForWorkspace({ type: reg.type, root: reg.root, distro: reg.distro, linuxUser: reg.linuxUser });
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
  ipcMain.handle("app:platform", (event) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
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

  ipcMain.handle("daily:getToday", async (event, workspaceId: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const wid = validateWorkspaceId(workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    const out = await getDaily().getToday(wid.workspaceId);
    if ("error" in out) return { ok: false, error: out.error };
    return { ok: true, result: out.info };
  });

  ipcMain.handle("daily:createToday", async (event, workspaceId: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const wid = validateWorkspaceId(workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    const out = await getDaily().createToday(wid.workspaceId);
    if ("error" in out) return { ok: false, error: out.error };
    return { ok: true, result: out.result };
  });

  ipcMain.handle("workspace:openLocal", async (event) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const win = BrowserWindow.fromWebContents(event.sender)!;
    // Native Explorer / Finder / desktop file picker (§17, §160).
    const result = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
    if (result.canceled || result.filePaths.length === 0) return { ok: true, result: null };
    const root = result.filePaths[0]!;
    const reg = workspaces.registerLocal(path.basename(root), root, localWorkspaceKind(currentDesktopPlatform()));
    rememberLocalWorkspace(reg);
    watcher().start({ workspaceId: reg.id, root: reg.root, kind: reg.type });
    return { ok: true, result: { ...toWorkspaceInfo(reg), connection: "connected" as const } };
  });

  ipcMain.handle("workspace:listRecent", async (event) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    return { ok: true, result: publicRecentWorkspaces() };
  });

  ipcMain.handle("workspace:openRecent", async (event, id: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    if (typeof id !== "string" || !/^[a-f0-9]{24}$/.test(id)) {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid recent workspace." } };
    }
    const record = readRecentWorkspaces().find((r) => r.id === id);
    if (!record) return { ok: false, error: { code: "NOT_FOUND", message: "Recent workspace was not found." } };
    try {
      if (!existsSync(record.root) || !statSync(record.root).isDirectory()) {
        writeRecentWorkspaces(readRecentWorkspaces().filter((r) => r.id !== id));
        return { ok: false, error: { code: "NOT_FOUND", message: "That folder no longer exists." } };
      }
      const reg = workspaces.registerLocal(record.displayName || path.basename(record.root), record.root, record.type);
      rememberLocalWorkspace(reg);
      watcher().start({ workspaceId: reg.id, root: reg.root, kind: reg.type });
      return { ok: true, result: { ...toWorkspaceInfo(reg), connection: "connected" as const } };
    } catch (err) {
      return { ok: false, error: { code: "INTERNAL_ERROR", message: "Couldn't reopen recent workspace.", detail: String(err) } };
    }
  });

  ipcMain.handle("workspace:close", async (event, workspaceId: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const v = validateWorkspaceId(workspaceId);
    if ("error" in v) return { ok: false, error: v.error };
    const reg = workspaces.get(v.workspaceId);
    if (reg && !isNativeWorkspace(reg)) {
      // Best-effort: release the runtime/helper-side root; registry close always runs.
      // Close on the transport that owns this workspace — a runtime session
      // for another distro/user must not be torn down by mistake.
      try {
        const matches = (s: { distro: string; linuxUser: string } | null | undefined): boolean =>
          !!s && s.distro === reg.distro && s.linuxUser === reg.linuxUser;
        if (runtimeSupervisor && matches(runtimeSupervisor.getSession())) {
          await runtimeSupervisor.request("workspace.close", {});
        } else if (supervisor && matches(supervisor.getSession())) {
          await supervisor.request("workspace.close", {});
        }
      } catch {
        /* transport already gone — registry is the source of truth */
      }
    }
    watcher().stop(v.workspaceId);
    workspaces.close(v.workspaceId);
    // Detach from its Connection; the record (and status) persists — one
    // connection outlives any single workspace (7b, ADR-0007).
    connections.detachWorkspace(v.workspaceId);
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
    // Connection record first (7b): identity + `connecting` status exist
    // before any spawn, so state callbacks and the close path always have
    // a record to project onto. Validation above guarantees the key builds.
    activeConnectionKey = connections.markConnecting(distro as string, linuxUser as string);
    const connectionId = activeConnectionKey;
    const useRuntime = process.env["TAKENOTES_WSL_RUNTIME"] !== "0";
    if (useRuntime) {
      const runtime = getRuntimeSupervisor(broadcast);
      const base = runtime.resourceBase();
      const runtimePath = path.join(base, "runtime.cjs");
      if (existsSync(runtimePath)) {
        try {
          await runtime.connect(distro, linuxUser, path.join(base, "node"), runtimePath);
          console.error("[wsl-runtime-connect] bootstrap ok, opening workspace", { distro, linuxUser, linuxPath });
          let openedRoot: string;
          try {
            const opened = (await runtime.request("workspace.open", { root: linuxPath })) as { root?: unknown };
            if (!opened || typeof opened.root !== "string") throw { code: "INTERNAL_ERROR", message: "Workspace did not open." };
            openedRoot = opened.root;
          } catch (openErr) {
            console.error("[wsl-runtime-connect] workspace.open failed", { distro, linuxUser, linuxPath, error: toHelperError(openErr) });
            runtime.disconnect();
            connections.markDisconnected(distro as string, linuxUser as string);
            return { ok: false, error: toHelperError(openErr) };
          }
          console.error("[wsl-runtime-connect] workspace.open ok", { distro, linuxUser, linuxPath, openedRoot });
          // The desktop workspace id remains renderer-facing; the runtime keeps
          // its own process-local workspace id internally.
          const reg = workspaces.registerWsl(`${distro}:${linuxUser}:${linuxPath}`, openedRoot, distro as string, linuxUser as string, connectionId);
          connections.attachWorkspace(distro as string, linuxUser as string, reg.id);
          connections.markConnected(distro as string, linuxUser as string);
          return { ok: true, result: { ...toWorkspaceInfo(reg), connection: "connected" as const } };
        } catch (err) {
          connections.markFailed(distro as string, linuxUser as string);
          return { ok: false, error: { code: "DISCONNECTED", message: "Could not connect to WSL runtime.", detail: String(err) } };
        }
      }
      console.error(`[wsl-runtime-connect] runtime.cjs not found at ${runtimePath}; falling back to helper transport.`);
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
        connections.markDisconnected(distro as string, linuxUser as string);
        return { ok: false, error: toHelperError(openErr) };
      }
      console.error("[wsl-connect] workspace.open ok", { distro, linuxUser, linuxPath, openedRoot });
      const reg = workspaces.registerWsl(`${distro}:${linuxUser}:${linuxPath}`, openedRoot, distro as string, linuxUser as string, connectionId);
      connections.attachWorkspace(distro as string, linuxUser as string, reg.id);
      connections.markConnected(distro as string, linuxUser as string);
      return { ok: true, result: { ...toWorkspaceInfo(reg), connection: "connected" as const } };
    } catch (err) {
      connections.markFailed(distro as string, linuxUser as string);
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

  ipcMain.handle("directory:rename", async (event, workspaceId: unknown, oldPath: unknown, newPath: unknown, opts: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const wid = validateWorkspaceId(workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    if (typeof oldPath !== "string" || typeof newPath !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid rename request." } };
    }
    const autoUpdateLinks = opts === undefined || (typeof opts === "object" && opts !== null && (opts as { autoUpdateLinks?: unknown }).autoUpdateLinks !== false);
    const reg = workspaces.get(wid.workspaceId);
    if (!reg) return { ok: false, error: { code: "INVALID_REQUEST", message: "Unknown workspace." } };
    if (!isNativeWorkspace(reg)) {
      const vOld = normalizeWslRel(oldPath, false);
      if ("error" in vOld) return { ok: false, error: vOld.error };
      const vNew = normalizeWslRel(newPath, false);
      if ("error" in vNew) return { ok: false, error: vNew.error };
      const out = await getNotes().renameDirectory(wid.workspaceId, vOld.rel, vNew.rel, { autoUpdateLinks });
      if ("error" in out) return { ok: false, error: out.error };
      return { ok: true, result: null };
    }
    const out = await getNotes().renameDirectory(wid.workspaceId, toCanonicalRel(oldPath), toCanonicalRel(newPath), { autoUpdateLinks });
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

  ipcMain.handle("recovery:captureChanged", async (event, args: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const a = args as { workspaceId?: unknown; relativePath?: unknown; content?: unknown; reason?: unknown };
    const wid = validateWorkspaceId(a?.workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    const reg = workspaces.get(wid.workspaceId);
    if (!reg || typeof a?.relativePath !== "string" || typeof a?.content !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid recovery snapshot request." } };
    }
    const prep = handlerRel(reg, a.relativePath, false);
    if ("error" in prep) return { ok: false, error: prep.error };
    const reason =
      a.reason === "save" || a.reason === "close" || a.reason === "shutdown" || a.reason === "restore-before" ? a.reason : "edit";
    return recovery().captureChanged({ workspaceId: recoveryNamespace(reg), relativePath: prep.rel, content: a.content, reason });
  });

  ipcMain.handle("recovery:list", async (event, workspaceId: unknown, relativePath: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const wid = validateWorkspaceId(workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    const reg = workspaces.get(wid.workspaceId);
    if (!reg || typeof relativePath !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid recovery history request." } };
    }
    const prep = handlerRel(reg, relativePath, false);
    if ("error" in prep) return { ok: false, error: prep.error };
    return recovery().list(recoveryNamespace(reg), prep.rel);
  });

  ipcMain.handle("recovery:read", async (event, workspaceId: unknown, snapshotId: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const wid = validateWorkspaceId(workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    const reg = workspaces.get(wid.workspaceId);
    if (!reg) return { ok: false, error: { code: "INVALID_REQUEST", message: "Unknown workspace." } };
    if (typeof snapshotId !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid recovery snapshot id." } };
    }
    // Scoped read (M-01): the snapshot must belong to THIS workspace's
    // stable namespace — no global snapshot lookup reaches the renderer.
    return recovery().read(recoveryNamespace(reg), snapshotId);
  });

  ipcMain.handle("recovery:restore", async (event, args: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const a = args as {
      workspaceId?: unknown;
      relativePath?: unknown;
      snapshotId?: unknown;
      currentContent?: unknown;
      expectedHash?: unknown;
      newlineStyle?: unknown;
      hadBom?: unknown;
    };
    const wid = validateWorkspaceId(a?.workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    const reg = workspaces.get(wid.workspaceId);
    if (
      !reg ||
      typeof a?.relativePath !== "string" ||
      typeof a?.snapshotId !== "string" ||
      typeof a?.currentContent !== "string" ||
      typeof a?.expectedHash !== "string"
    ) {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid recovery restore request." } };
    }
    const prep = handlerRel(reg, a.relativePath, false);
    if ("error" in prep) return { ok: false, error: prep.error };
    const namespace = recoveryNamespace(reg);
    return recovery().restore(
      {
        workspaceId: namespace,
        relativePath: prep.rel,
        snapshotId: a.snapshotId,
        currentContent: a.currentContent,
        expectedHash: a.expectedHash,
        newlineStyle: a.newlineStyle === "crlf" ? "crlf" : "lf",
        hadBom: a.hadBom === true,
      },
      (content, expectedHash, newlineStyle, hadBom) => getNotes().writeFile(wid.workspaceId, prep.rel, content, expectedHash, newlineStyle, hadBom),
    );
  });

  // Raw-byte attachment import (Step 4): base64 over IPC, decoded once
  // main-side. The string-length pre-guard keeps absurd payloads out of
  // the decoder; the decoded-byte cap lives in `writeBinaryFile`.
  ipcMain.handle("file:importBinary", async (event, args: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const a = args as { workspaceId?: unknown; relativePath?: unknown; base64?: unknown };
    const wid = validateWorkspaceId(a?.workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    if (typeof a?.relativePath !== "string" || typeof a?.base64 !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid attachment import request." } };
    }
    if (a.base64.length === 0 || a.base64.length > MAX_IMPORT_BYTES * 2) {
      return { ok: false, error: { code: "TOO_LARGE", message: "This file is too large to import (over 100 MiB)." } };
    }
    const reg = workspaces.get(wid.workspaceId);
    if (!reg) return { ok: false, error: { code: "INVALID_REQUEST", message: "Unknown workspace." } };
    const prep = handlerRel(reg, a.relativePath, false);
    if ("error" in prep) return { ok: false, error: prep.error };
    const rel = prep.rel;
    let bytes: Buffer;
    try {
      bytes = Buffer.from(a.base64, "base64");
    } catch {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid attachment data." } };
    }
    const out = await getNotes().importBinary(wid.workspaceId, rel, bytes);
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

  ipcMain.handle("file:rename", async (event, workspaceId: unknown, oldPath: unknown, newPath: unknown, opts: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const wid = validateWorkspaceId(workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    if (typeof oldPath !== "string" || typeof newPath !== "string") {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Invalid rename request." } };
    }
    const autoUpdateLinks = opts === undefined || (typeof opts === "object" && opts !== null && (opts as { autoUpdateLinks?: unknown }).autoUpdateLinks !== false);
    const reg = workspaces.get(wid.workspaceId);
    if (!reg) return { ok: false, error: { code: "INVALID_REQUEST", message: "Unknown workspace." } };
    if (!isNativeWorkspace(reg)) {
      const vOld = normalizeWslRel(oldPath, false);
      if ("error" in vOld) return { ok: false, error: vOld.error };
      const vNew = normalizeWslRel(newPath, false);
      if ("error" in vNew) return { ok: false, error: vNew.error };
      const out = await getNotes().renamePath(wid.workspaceId, vOld.rel, vNew.rel, { autoUpdateLinks });
      if ("error" in out) return { ok: false, error: out.error };
      return { ok: true, result: null };
    }
    const out = await getNotes().renamePath(wid.workspaceId, toCanonicalRel(oldPath), toCanonicalRel(newPath), { autoUpdateLinks });
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

  ipcMain.handle("app:version", (event) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    return { ok: true, result: app.getVersion() };
  });

  // Step 9 window frame (slice 6b): the renderer is the sole writer;
  // main reads the stored value before the renderer exists. Corrupt or
  // missing files fall back to `auto` — never a broken window.
  ipcMain.handle("app:frameStyle", (event) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    return { ok: true, result: storedFrameStyle() };
  });

  ipcMain.handle("app:setFrameStyle", (event, style: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const parsed = parseFrameStyle(style);
    if (parsed === undefined) {
      const error: AppError = { code: "INVALID_REQUEST", message: "Unknown frame style." };
      return { ok: false, error };
    }
    try {
      const file = frameStylePath(app.getPath("userData"));
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, serializeFrameStyle(parsed));
    } catch {
      const error: AppError = { code: "INTERNAL_ERROR", message: "Couldn't save the frame style." };
      return { ok: false, error };
    }
    return { ok: true, result: parsed };
  });

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

  // MCP automation (Step 8, ADR-0012): private pipe for the stdio sidecar
  // plus the approval-screen handlers. Best-effort: a pipe failure warns
  // and disables MCP without breaking the app.
  void (async () => {
    try {
      const { grants, log } = await mcpState();
      if (!mcpPipe) {
        mcpPipe = await startMcpPipeServer({
          ports: createMcpPorts({ workspaces, notes: getNotes() }),
          grants,
          log,
          activityDir: mcpDir(),
        });
      }
    } catch (err) {
      console.warn(`MCP pipe unavailable: ${(err as Error)?.message ?? err}`);
    }
  })();

  ipcMain.handle("mcp:clients", async (event) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const { grants, log } = await mcpState();
    const byClient = new Map<string, { workspaceId: string; displayName: string | null; grantedAt: number }[]>();
    for (const grant of grants.grants) {
      const reg = workspaces.get(grant.workspaceId);
      const rows = byClient.get(grant.clientId) ?? [];
      rows.push({
        workspaceId: grant.workspaceId,
        displayName: reg?.displayName ?? null,
        grantedAt: grant.grantedAt,
      });
      byClient.set(grant.clientId, rows);
    }
    const denied = new Set<string>();
    for (const entry of log.entries) {
      if (!entry.ok && entry.errorCode === "PERMISSION_DENIED") denied.add(entry.clientId);
    }
    const pending = [...denied].filter((clientId) => !byClient.has(clientId)).sort();
    return {
      ok: true,
      result: {
        granted: [...byClient.entries()].map(([clientId, rows]) => ({ clientId, grants: rows })).sort((a, b) => (a.clientId < b.clientId ? -1 : 1)),
        pending,
        workspaces: workspaces.list().map((reg) => ({ id: reg.id, displayName: reg.displayName })),
        activity: log.entries.slice(-20).reverse(),
        sidecarCommand: mcpSidecarCommand(),
      },
    };
  });

  ipcMain.handle("mcp:grant", async (event, clientId: unknown, workspaceId: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const client = validateMcpClientId(clientId);
    if ("error" in client) return { ok: false, error: client.error };
    const wid = validateWorkspaceId(workspaceId);
    if ("error" in wid) return { ok: false, error: wid.error };
    if (!workspaces.get(wid.workspaceId)) {
      return { ok: false, error: { code: "NOT_FOUND", message: "Workspace not found." } };
    }
    const { grants, log } = await mcpState();
    grantAccess(grants, client.clientId, wid.workspaceId);
    await saveMcpGrants(mcpDir(), grants);
    log.entries.push({
      seq: log.nextSeq++,
      at: Date.now(),
      clientId: client.clientId,
      tool: "mcp:grant",
      workspaceId: wid.workspaceId,
      ok: true,
    });
    await appendMcpActivity(mcpDir(), log.entries.slice(-1));
    return { ok: true, result: null };
  });

  ipcMain.handle("mcp:revoke", async (event, clientId: unknown, workspaceId: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const client = validateMcpClientId(clientId);
    if ("error" in client) return { ok: false, error: client.error };
    const { grants } = await mcpState();
    if (workspaceId === undefined || workspaceId === null) {
      revokeClient(grants, client.clientId);
    } else {
      const wid = validateWorkspaceId(workspaceId);
      if ("error" in wid) return { ok: false, error: wid.error };
      revokeAccess(grants, client.clientId, wid.workspaceId);
    }
    await saveMcpGrants(mcpDir(), grants);
    return { ok: true, result: null };
  });

  // Markdown/HTML/Textbundle import (Step 8): the picker + bytes stay in
  // main (renderer never sees outside absolute paths). `pick` previews,
  // `confirm` applies via a single-use token.
  ipcMain.handle("import:pick", async (event, workspaceId: unknown, options: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const win = BrowserWindow.fromWebContents(event.sender);
    const out = await getImportRunner().pickImport(win, workspaceId, options);
    if ("error" in out) return { ok: false, error: out.error };
    return { ok: true, result: out.preview };
  });

  ipcMain.handle("import:confirm", async (event, workspaceId: unknown, token: unknown) => {
    if (!senderIsOurs(event)) throw new Error("Unauthorized sender.");
    const out = await getImportRunner().confirmImport(workspaceId, token);
    if ("error" in out) return { ok: false, error: out.error };
    return { ok: true, result: out.summary };
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

/** Stored frame preference for window creation (main-side read: the
 * renderer file is localStorage, which doesn't exist yet at launch). */
function storedFrameStyle(): "auto" | "native" {
  try {
    return readFrameStyleFile(readFileSync(frameStylePath(app.getPath("userData")), "utf8"));
  } catch {
    return "auto";
  }
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
    // Step 9 frame preference (slice 6b): stored under the profile, read
    // before the renderer exists; changes apply after restart.
    storedFrameStyle(),
  );
  registerIpc((kind, payload) => {
    if (!win.isDestroyed()) win.webContents.send(`takenotes:${kind}`, payload);
  });
}
