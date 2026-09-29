import type { Context, Next } from "hono";
import { Hono } from "hono";
import { randomBytes, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { appError, type AppError } from "@takenotes/contracts/errors";
import type { DirectoryEntry, FileReadResult, FileRevision, IpcResult } from "@takenotes/contracts/ipc";
import { CoreNoteService } from "@takenotes/core/services/note-service";
import { validateWorkspaceId } from "@takenotes/core/policy/note-policy";
import { LinuxHostFilesystem } from "./linux-host-filesystem.js";
import { InMemoryRuntimeWorkspaceRegistry } from "./runtime-registry.js";
import {
  assertDirectoryRoot,
  createDirectory,
  createFile,
  deleteDirectory,
  deleteFile,
  listDirectory,
  renamePath,
  resolveRuntimeRoot,
} from "./runtime-files.js";

function ok<T>(result: T): IpcResult<T> {
  return { ok: true, result };
}

function fail<T = never>(error: AppError): IpcResult<T> {
  return { ok: false, error };
}

async function jsonBody(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function bearerToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export type RuntimeAuth = {
  token: string;
  require(c: Context, next: Next): Promise<Response | void>;
};

export function createBearerRuntimeAuth(token = bearerToken()): RuntimeAuth {
  return {
    token,
    async require(c, next) {
      const auth = c.req.header("authorization") ?? "";
      const prefix = "Bearer ";
      const supplied = auth.startsWith(prefix) ? auth.slice(prefix.length) : "";
      if (!supplied || !safeEqual(supplied, token)) return c.json(fail(appError("PERMISSION_DENIED", "Authentication required.")), 401);
      return next();
    },
  };
}

export type WslRuntimeAppOptions = {
  token?: string;
  version?: string;
};

export type WslRuntimeApp = {
  app: Hono;
  token: string;
  registry: InMemoryRuntimeWorkspaceRegistry;
};

function resolveWorkspace(
  registry: InMemoryRuntimeWorkspaceRegistry,
  workspaceId: unknown,
): { ws: { workspaceId: string; displayName: string; kind: "linux-local"; root: string; createdAt: number } } | { error: AppError } {
  const wid = validateWorkspaceId(workspaceId);
  if ("error" in wid) return { error: wid.error };
  const ws = registry.get(wid.workspaceId);
  if (!ws) return { error: appError("INVALID_REQUEST", "Unknown workspace.") };
  return { ws };
}

export function createWslRuntimeApp(options: WslRuntimeAppOptions = {}): WslRuntimeApp {
  const auth = createBearerRuntimeAuth(options.token);
  const registry = new InMemoryRuntimeWorkspaceRegistry();
  const notes = new CoreNoteService(new LinuxHostFilesystem());
  const app = new Hono();
  const version = options.version ?? "0.0.0-dev";

  app.get("/api/runtime/health", (c) => c.json(ok({ status: "ok" as const, version })));
  app.use("/api/runtime/rpc/*", (c, next) => auth.require(c, next));

  app.post("/api/runtime/rpc/:operation", async (c) => {
    const operation = c.req.param("operation");
    const body = await jsonBody(c);

    if (operation === "workspace.open") {
      const rootResult = resolveRuntimeRoot(body["root"]);
      if ("error" in rootResult) return c.json(fail(rootResult.error));
      const checked = await assertDirectoryRoot(rootResult.root);
      if ("error" in checked) return c.json(fail(checked.error));
      const displayName = path.posix.basename(checked.root) || checked.root;
      const ws = registry.registerLinuxWorkspace(displayName, checked.root);
      return c.json(ok({ workspaceId: ws.workspaceId, root: ws.root, displayName: ws.displayName }));
    }

    if (operation === "workspace.close") {
      const wid = validateWorkspaceId(body["workspaceId"]);
      if ("error" in wid) return c.json(fail(wid.error));
      registry.close(wid.workspaceId);
      return c.json(ok(null));
    }

    const resolved = resolveWorkspace(registry, body["workspaceId"]);
    if ("error" in resolved) return c.json(fail(resolved.error));
    const { ws } = resolved;

    if (operation === "directory.list") {
      const out = await listDirectory(ws.root, body["relativePath"] ?? "");
      return "error" in out ? c.json(fail<DirectoryEntry[]>(out.error)) : c.json(ok(out.entries));
    }
    if (operation === "directory.create") {
      const out = await createDirectory(ws.root, body["relativePath"]);
      return "error" in out ? c.json(fail(out.error)) : c.json(ok(null));
    }
    if (operation === "directory.rename") {
      const out = await renamePath(ws.root, body["oldPath"], body["newPath"], "directory");
      return "error" in out ? c.json(fail(out.error)) : c.json(ok(null));
    }
    if (operation === "directory.delete") {
      const out = await deleteDirectory(ws.root, body["relativePath"], body["recursive"]);
      return "error" in out ? c.json(fail(out.error)) : c.json(ok(null));
    }
    if (operation === "file.read") {
      if (typeof body["relativePath"] !== "string") return c.json(fail<FileReadResult>(appError("INVALID_REQUEST", "Invalid file read request.")));
      const out = await notes.read({ root: ws.root, kind: ws.kind }, body["relativePath"]);
      return "error" in out ? c.json(fail<FileReadResult>(out.error)) : c.json(ok(out.result));
    }
    if (operation === "file.write") {
      if (typeof body["relativePath"] !== "string" || typeof body["content"] !== "string" || typeof body["expectedHash"] !== "string") {
        return c.json(fail<FileRevision>(appError("INVALID_REQUEST", "Invalid file write request.")));
      }
      const out = await notes.update(
        { root: ws.root, kind: ws.kind },
        body["relativePath"],
        body["content"],
        body["expectedHash"],
        body["newlineStyle"] === "crlf" ? "crlf" : "lf",
        body["hadBom"] === true,
      );
      return "error" in out ? c.json(fail<FileRevision>(out.error)) : c.json(ok(out.revision));
    }
    if (operation === "file.create") {
      const out = await createFile(ws.root, body["relativePath"], body["content"] ?? "");
      return "error" in out ? c.json(fail<FileRevision>(out.error)) : c.json(ok(out.revision));
    }
    if (operation === "file.rename") {
      const out = await renamePath(ws.root, body["oldPath"], body["newPath"], "file");
      return "error" in out ? c.json(fail(out.error)) : c.json(ok(null));
    }
    if (operation === "file.delete") {
      const out = await deleteFile(ws.root, body["relativePath"]);
      return "error" in out ? c.json(fail(out.error)) : c.json(ok(null));
    }

    return c.json(fail(appError("INVALID_REQUEST", `Unknown operation: ${operation}`)));
  });

  return { app, token: auth.token, registry };
}
