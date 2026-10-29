import type { Context, Hono } from "hono";
import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { appError, type AppError } from "@takenotes/contracts/errors";
import { updateFrontmatter } from "@takenotes/core/index/properties";
import type { HostFilesystem } from "@takenotes/core/ports/host-filesystem";
import { emptyActivityLog, type McpActivityEntry } from "@takenotes/core/mcp/activity";
import { dispatchMcpTool } from "@takenotes/core/mcp/dispatch";
import { emptyGrantStore, grantAccess } from "@takenotes/core/mcp/grants";
import { createMcpPorts, type McpHostNotes, type McpHostWorkspaces } from "@takenotes/core/mcp/host";
import { createMcpSession } from "@takenotes/core/mcp/session";
import type { McpPipeResponse } from "@takenotes/core/mcp/transport";
import { CoreNoteService, type CoreWorkspace } from "@takenotes/core/services/note-service";
import { AGENT_TOKEN_PREFIX, type AgentTokenStore } from "./agent-tokens.js";
import { RateLimiter } from "./rate-limit.js";
import { listDirectory } from "./runtime-files.js";
import type { PersistentServerWorkspaceRegistry } from "./workspace-registry.js";

/** Request body cap (ADR-0017). Notes are capped far below this per file. */
export const MAX_MCP_BODY_BYTES = 1024 * 1024;
const ACTIVITY_FILE = "mcp-activity.jsonl";
const ACTIVITY_ROTATE_BYTES = 512 * 1024;

/** Tools a `read` token may not call. Everything else is read-only by catalog. */
export const MCP_WRITE_TOOLS: ReadonlySet<string> = new Set([
  "note_create",
  "note_update",
  "task_create",
  "task_update",
  "task_complete",
  "calendar_create",
  "calendar_update",
  "daily_append",
]);

export function createServerMcpWorkspaces(registry: PersistentServerWorkspaceRegistry): McpHostWorkspaces {
  const view = (w: { workspaceId: string; displayName: string; kind: string }) => ({
    id: w.workspaceId,
    displayName: w.displayName,
    type: w.kind,
  });
  return {
    list: () => registry.list().map(view),
    get: (id) => {
      const w = registry.get(id);
      return w ? view(w) : undefined;
    },
  };
}

/** `McpHostNotes` over the same `CoreNoteService` the HTTP RPC uses (ADR-0014). */
export function createServerMcpNotes(
  registry: PersistentServerWorkspaceRegistry,
  host: HostFilesystem,
): McpHostNotes {
  const notes = new CoreNoteService(host);
  const resolve = (workspaceId: string): { ws: CoreWorkspace } | { error: AppError } => {
    const w = registry.get(workspaceId);
    return w ? { ws: { root: w.root, kind: w.kind } } : { error: appError("NOT_FOUND", "Unknown workspace.") };
  };
  return {
    async listTree(workspaceId, relativePath) {
      const r = resolve(workspaceId);
      return "error" in r ? r : listDirectory(r.ws.root, relativePath);
    },
    async readFile(workspaceId, relativePath) {
      const r = resolve(workspaceId);
      return "error" in r ? r : notes.read(r.ws, relativePath);
    },
    async createFile(workspaceId, relativePath, content = "") {
      const r = resolve(workspaceId);
      return "error" in r ? r : notes.create(r.ws, relativePath, content);
    },
    async writeFile(workspaceId, relativePath, content, expectedHash, newlineStyle, hadBom) {
      const r = resolve(workspaceId);
      return "error" in r ? r : notes.update(r.ws, relativePath, content, expectedHash, newlineStyle, hadBom);
    },
    async updateProperties(workspaceId, relativePath, patch, expectedHash) {
      const r = resolve(workspaceId);
      if ("error" in r) return r;
      const read = await notes.read(r.ws, relativePath);
      if ("error" in read) return read;
      const cur = read.result;
      if (cur.revision.hash !== expectedHash) {
        return { error: appError("CONFLICT", "The file changed on disk. Reload before saving.") };
      }
      const patched = updateFrontmatter(cur.content, patch);
      if ("error" in patched) return patched;
      if (patched.content === cur.content) return { revision: cur.revision };
      return notes.update(r.ws, relativePath, patched.content, expectedHash, cur.newlineStyle, cur.hadBom);
    },
  };
}

/** Append-only JSONL audit sink in app-data (never in workspaces); rotates once. */
export function createActivitySink(appDir: string): (entry: McpActivityEntry) => Promise<void> {
  const file = path.join(appDir, ACTIVITY_FILE);
  return async (entry) => {
    try {
      await mkdir(appDir, { recursive: true });
      try {
        if ((await stat(file)).size > ACTIVITY_ROTATE_BYTES) await rename(file, `${file}.1`);
      } catch {
        /* no file yet */
      }
      await appendFile(file, `${JSON.stringify(entry)}\n`, "utf8");
    } catch {
      /* audit is best-effort; never fail the tool call on a log write */
    }
  };
}

/** Defaults: generous for an agent loop, tight enough to stop runaways/guessing. */
export const MCP_RATE_DEFAULTS = { perTokenPerMinute: 120, failuresPerClientPerMinute: 20 } as const;

export type McpRateOptions = {
  perTokenPerMinute?: number;
  failuresPerClientPerMinute?: number;
  now?: () => number;
};

export type McpHttpOptions = {
  rate?: McpRateOptions;
  tokens: AgentTokenStore;
  registry: PersistentServerWorkspaceRegistry;
  host: HostFilesystem;
  onActivity?: (entry: McpActivityEntry) => void | Promise<void>;
};

function clientKey(c: Context): string {
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
  return env?.incoming?.socket?.remoteAddress ?? "unknown";
}

function rpcError(code: number, message: string) {
  return { jsonrpc: "2.0" as const, id: null, error: { code, message } };
}

/**
 * `POST /mcp` — stateless JSON-RPC 2.0 over HTTP (ADR-0017).
 *
 * Reuses the stdio session, tool catalog, dispatcher and grants; the only new
 * code is authentication and the token→grants mapping. Browser requests
 * (`Origin` present) are refused; the bearer token is the sole credential.
 */
export function mountMcp(app: Hono, options: McpHttpOptions): void {
  const ports = createMcpPorts({
    workspaces: createServerMcpWorkspaces(options.registry),
    notes: createServerMcpNotes(options.registry, options.host),
  });

  const WINDOW_MS = 60_000;
  const perToken = new RateLimiter(
    options.rate?.perTokenPerMinute ?? MCP_RATE_DEFAULTS.perTokenPerMinute,
    WINDOW_MS,
    options.rate?.now,
  );
  const failures = new RateLimiter(
    options.rate?.failuresPerClientPerMinute ?? MCP_RATE_DEFAULTS.failuresPerClientPerMinute,
    WINDOW_MS,
    options.rate?.now,
  );

  // No SSE stream: advertise that explicitly rather than hanging the client.
  app.get("/mcp", (c) => c.json(rpcError(-32000, "This endpoint accepts POST only."), 405, { Allow: "POST" }));

  app.post("/mcp", async (c) => {
    if (c.req.header("origin") !== undefined) {
      return c.json(rpcError(-32000, "Browser origins are not allowed."), 403);
    }
    const client = clientKey(c);
    const lockout = failures.blocked(client);
    if (!lockout.allowed) {
      return c.json(rpcError(-32002, "Too many failed attempts. Wait and retry."), 429, {
        "Retry-After": String(lockout.retryAfterSec),
      });
    }
    const auth = c.req.header("authorization") ?? "";
    const raw = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    const record = raw.startsWith(AGENT_TOKEN_PREFIX) ? await options.tokens.verify(raw) : null;
    if (!record) {
      failures.hit(client);
      return c.json(rpcError(-32001, "Invalid or missing agent token."), 401, { "WWW-Authenticate": "Bearer" });
    }
    const rate = perToken.hit(record.id);
    if (!rate.allowed) {
      return c.json(rpcError(-32002, "Rate limit exceeded for this agent token."), 429, {
        "Retry-After": String(rate.retryAfterSec),
      });
    }

    const declared = Number(c.req.header("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > MAX_MCP_BODY_BYTES) {
      return c.json(rpcError(-32600, "Request too large."), 413);
    }
    const text = await c.req.text();
    if (Buffer.byteLength(text, "utf8") > MAX_MCP_BODY_BYTES) {
      return c.json(rpcError(-32600, "Request too large."), 413);
    }
    let message: unknown;
    try {
      message = JSON.parse(text);
    } catch {
      return c.json(rpcError(-32700, "Parse error."), 400);
    }
    if (Array.isArray(message)) {
      return c.json(rpcError(-32600, "Batch requests are not supported."), 400);
    }

    // A token's workspace list *is* its grant set; the dispatcher enforces it.
    const clientId = record.label;
    const grants = emptyGrantStore();
    for (const workspaceId of record.workspaceIds) grantAccess(grants, clientId, workspaceId);
    const log = emptyActivityLog();

    const session = createMcpSession(
      async (tool, params, caller): Promise<McpPipeResponse> => {
        const requestId = "http";
        if (record.scope === "read" && MCP_WRITE_TOOLS.has(tool)) {
          void options.onActivity?.({
            seq: 0,
            at: Date.now(),
            clientId: caller,
            tool,
            ok: false,
            errorCode: "PERMISSION_DENIED",
          });
          return { requestId, ok: false, error: { code: "PERMISSION_DENIED", message: "This agent token is read-only." } };
        }
        const out = await dispatchMcpTool({ ports, grants, log }, caller, tool, params);
        for (const entry of log.entries.splice(0)) void options.onActivity?.(entry);
        return out.ok
          ? { requestId, ok: true, result: out.result }
          : { requestId, ok: false, error: out.error };
      },
      { initialized: true, clientId },
    );

    const reply = await session.handle(message);
    if (reply === null) return c.body(null, 202);
    return c.json(reply);
  });
}

export type AgentsApiOptions = {
  tokens: AgentTokenStore;
  registry: PersistentServerWorkspaceRegistry;
};

/**
 * Owner-only token management for the web UI (Settings → Agents).
 *
 * Mount AFTER the `/api/rpc/*` session+CSRF middleware: these handlers assume
 * the caller is the authenticated owner. The raw token appears only in the
 * `agents.create` response.
 */
export function mountAgentsApi(app: Hono, options: AgentsApiOptions): void {
  const ok = <T,>(result: T) => ({ ok: true as const, result });
  const fail = (error: AppError) => ({ ok: false as const, error });
  const body = async (c: Context): Promise<Record<string, unknown>> => {
    try {
      const v = await c.req.json();
      return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  };

  app.post("/api/rpc/agents.list", async (c) => c.json(ok(await options.tokens.list())));

  app.post("/api/rpc/agents.create", async (c) => {
    const b = await body(c);
    const label = typeof b.label === "string" ? b.label.trim() : "";
    const scope = b.scope === "read" ? "read" : "write";
    const ids = Array.isArray(b.workspaceIds) ? b.workspaceIds.filter((w): w is string => typeof w === "string") : [];
    if (!label || ids.length === 0) {
      return c.json(fail(appError("INVALID_REQUEST", "A label and at least one workspace are required.")));
    }
    if (ids.some((id) => !options.registry.get(id))) {
      return c.json(fail(appError("INVALID_REQUEST", "Unknown workspace.")));
    }
    const created = await options.tokens.create({ label, workspaceIds: ids, scope });
    return c.json(ok(created));
  });

  app.post("/api/rpc/agents.revoke", async (c) => {
    const b = await body(c);
    const revoked = typeof b.id === "string" && (await options.tokens.revoke(b.id));
    return c.json(revoked ? ok(null) : fail(appError("NOT_FOUND", "No matching live token.")));
  });
}
