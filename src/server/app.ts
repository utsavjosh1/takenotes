import type { Context, Next } from "hono";
import { Hono } from "hono";
import { CoreNoteService, type CoreWorkspace } from "../core/services/note-service.js";
import type { HostFilesystem } from "../core/ports/host-filesystem.js";
import { validateWorkspaceId } from "../core/policy/note-policy.js";
import { appError, type AppError } from "../shared/errors.js";
import type { FileReadResult, FileRevision, IpcResult } from "../shared/contracts/ipc.js";
import { LinuxHostFilesystem } from "./linux-host-filesystem.js";
import type { SingleOwnerAuth } from "./auth.js";
import type { FileOwnerAuth } from "./auth-store.js";
import { PersistentServerWorkspaceRegistry } from "./workspace-registry.js";
import { WEB_UI_HTML } from "./web-ui.js";

/** Minimal gate both auth implementations satisfy (Gate B harness + Gate C store). */
export type AuthGate = {
  require(c: Context, next: Next): Promise<Response | void>;
};

export type TakenotesServerOptions = {
  registry: PersistentServerWorkspaceRegistry;
  /** Session/CSRF gate for `/api/rpc/*` (either auth implementation). */
  auth: AuthGate | SingleOwnerAuth | FileOwnerAuth;
  host?: HostFilesystem;
  /** Persistent auth store enabling `/api/auth/*`. Absent in Gate-B harness mode. */
  authStore?: FileOwnerAuth | null;
  version?: string;
};

function ok<T>(result: T): IpcResult<T> {
  return { ok: true, result };
}

function fail<T = never>(error: AppError): IpcResult<T> {
  return { ok: false, error };
}

async function jsonBody(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

function clientKey(c: Context): string {
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
  return env?.incoming?.socket?.remoteAddress ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function resolveWorkspace(
  registry: PersistentServerWorkspaceRegistry,
  workspaceId: unknown,
): { ws: CoreWorkspace } | { error: AppError } {
  const wid = validateWorkspaceId(workspaceId);
  if ("error" in wid) return { error: wid.error };
  const reg = registry.get(wid.workspaceId);
  if (!reg) return { error: appError("INVALID_REQUEST", "Unknown workspace.") };
  return { ws: { root: reg.root, kind: reg.kind } };
}

export function createTakenotesServer(options: TakenotesServerOptions): Hono {
  const app = new Hono();
  const notes = new CoreNoteService(options.host ?? new LinuxHostFilesystem());
  const version = options.version ?? "0.0.0-dev";

  app.get("/", (c) => c.html(WEB_UI_HTML));

  // Health + readiness (unauthenticated by design; reveals no user data).
  app.get("/api/health", (c) => {
    const probe = options.registry.list() !== undefined;
    return c.json({ ok: true, result: { status: probe ? "ok" : "degraded", version } });
  });

  // Production auth routes (Gate C). Absent in Gate-B harness mode.
  if (options.authStore) {
    const store = options.authStore;
    app.post("/api/auth/login", async (c) => {
      const key = clientKey(c);
      if (store.isLoginThrottled(key)) {
        return c.json(fail(appError("PERMISSION_DENIED", "Too many login attempts. Wait and retry.")), 429);
      }
      const body = (await jsonBody(c)) as { password?: unknown } | null;
      const session =
        typeof body?.password === "string" ? await store.login(body.password) : null;
      if (!session) {
        store.recordFailedLogin(key);
        return c.json(fail(appError("PERMISSION_DENIED", "Login failed.")), 401);
      }
      store.clearFailedLogins(key);
      c.header("Set-Cookie", store.setCookieHeader(session.sessionId));
      return c.json(ok({ csrfToken: session.csrfToken }));
    });

    // Browser boot check: cookie-only liveness (no CSRF yet). CSRF is
    // enforced on every mutating/RPC call via `require`.
    app.get("/api/auth/session", (c) => {
      const creds = store.sessionFromRequest(c);
      if (!creds) return c.json(ok({ authenticated: false as const }));
      const status = store.sessionStatus(creds.sessionId);
      if (!status.live) return c.json(ok({ authenticated: false as const }));
      return c.json(ok({ authenticated: true as const, csrfToken: status.csrfToken }));
    });

    app.post("/api/auth/logout", async (c) => {
      const creds = store.sessionFromRequest(c);
      if (creds) await store.logout(creds.sessionId);
      c.header("Set-Cookie", store.clearCookieHeader());
      return c.json(ok(null));
    });

    app.post("/api/auth/password", async (c) => {
      const creds = store.sessionFromRequest(c);
      const v = creds ? store.validate(creds.sessionId, creds.csrf) : null;
      if (!v || !v.ok) {
        const status = v && !v.ok && v.status === 403 ? 403 : 401;
        const message = status === 403 ? "Invalid CSRF token." : "Authentication required.";
        return c.json(fail(appError("PERMISSION_DENIED", message)), status);
      }
      const body = (await jsonBody(c)) as { currentPassword?: unknown; nextPassword?: unknown } | null;
      if (typeof body?.currentPassword !== "string" || typeof body?.nextPassword !== "string") {
        return c.json(fail(appError("INVALID_REQUEST", "Invalid password change request.")));
      }
      try {
        const changed = await store.changePassword(body.currentPassword, body.nextPassword);
        if (!changed) return c.json(fail(appError("PERMISSION_DENIED", "Password change failed.")), 401);
      } catch (err) {
        return c.json(fail(appError("INVALID_REQUEST", err instanceof Error ? err.message : "Invalid password.")));
      }
      c.header("Set-Cookie", store.clearCookieHeader());
      return c.json(ok(null));
    });
  }

  app.use("/api/rpc/*", (c, next) => options.auth.require(c, next));

  app.post("/api/rpc/workspace.list", (c) => {
    const out = options.registry.list().map((w) => ({ workspaceId: w.workspaceId, displayName: w.displayName }));
    return c.json(ok(out));
  });

  app.post("/api/rpc/note.read", async (c) => {
    const body = (await jsonBody(c)) as { workspaceId?: unknown; relativePath?: unknown } | null;
    const r = resolveWorkspace(options.registry, body?.workspaceId);
    if ("error" in r) return c.json(fail<FileReadResult>(r.error));
    if (typeof body?.relativePath !== "string") {
      return c.json(fail<FileReadResult>(appError("INVALID_REQUEST", "Invalid note.read request.")));
    }
    const out = await notes.read(r.ws, body.relativePath);
    return "error" in out ? c.json(fail<FileReadResult>(out.error)) : c.json(ok(out.result));
  });

  app.post("/api/rpc/note.update", async (c) => {
    const body = (await jsonBody(c)) as {
      workspaceId?: unknown;
      relativePath?: unknown;
      content?: unknown;
      expectedHash?: unknown;
      newlineStyle?: unknown;
      hadBom?: unknown;
    } | null;
    const r = resolveWorkspace(options.registry, body?.workspaceId);
    if ("error" in r) return c.json(fail<FileRevision>(r.error));
    if (typeof body?.relativePath !== "string" || typeof body?.content !== "string" || typeof body?.expectedHash !== "string") {
      return c.json(fail<FileRevision>(appError("INVALID_REQUEST", "Invalid note.update request.")));
    }
    const out = await notes.update(
      r.ws,
      body.relativePath,
      body.content,
      body.expectedHash,
      body.newlineStyle === "crlf" ? "crlf" : "lf",
      body.hadBom === true,
    );
    return "error" in out ? c.json(fail<FileRevision>(out.error)) : c.json(ok(out.revision));
  });

  return app;
}
