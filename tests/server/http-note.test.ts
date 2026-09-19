import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTakenotesServer } from "../../src/server/app.js";
import { SingleOwnerAuth } from "../../src/server/auth.js";
import { TakenotesClient } from "../../src/server/client.js";
import { PersistentServerWorkspaceRegistry } from "../../src/server/workspace-registry.js";
import { WorkspaceRegistry } from "../../src/main/workspace/registry.js";
import { NativeFileAdapter } from "../../src/main/workspace/file-adapter.js";
import { NoteService } from "../../src/main/services/note-service.js";
import { WorkspaceService } from "../../src/main/services/workspace-service.js";
import type { CoreWorkspace } from "../../src/core/services/note-service.js";
import type { FileReadResult, FileRevision, IpcResult } from "../../src/shared/contracts/ipc.js";
import type { AppError } from "../../src/shared/errors.js";
import { defineNoteBehaviorSuite } from "../contracts/note-behavior-contract.js";

function tempRoot(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function honoFetch(app: ReturnType<typeof createTakenotesServer>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : input.toString();
    return app.request(request, init);
  }) as typeof fetch;
}

async function makeHttpHarness(root = tempRoot("takenotes-http-root-")) {
  const appRoot = tempRoot("takenotes-http-app-");
  const registry = new PersistentServerWorkspaceRegistry(join(appRoot, "app", "workspaces.json"));
  const workspace = await registry.registerLinuxWorkspace("Notes", root);
  const auth = new SingleOwnerAuth({ session: { sessionId: "owner-session", csrfToken: "csrf-token" } });
  const app = createTakenotesServer({ registry, auth });
  const client = new TakenotesClient({ baseUrl: "http://takenotes.test", fetch: honoFetch(app), session: auth.session });
  return { appRoot, root, registry, workspace, auth, app, client };
}

function makeIpcNotes(): { workspaces: WorkspaceService; notes: NoteService } {
  const workspaces = new WorkspaceService(new WorkspaceRegistry());
  const notes = new NoteService(workspaces, {
    native: new NativeFileAdapter(async () => undefined),
    wslRequest: async () => {
      throw { code: "DISCONNECTED", message: "no helper in test" };
    },
    hasWslSession: () => false,
  });
  return { workspaces, notes };
}

function readToIpc(out: { result: FileReadResult } | { error: AppError }): IpcResult<FileReadResult> {
  return "error" in out ? { ok: false, error: out.error } : { ok: true, result: out.result };
}

function revisionToIpc(out: { revision: FileRevision } | { error: AppError }): IpcResult<FileRevision> {
  return "error" in out ? { ok: false, error: out.error } : { ok: true, result: out.revision };
}

describe("Gate B HTTP note behavior", () => {
  defineNoteBehaviorSuite("HTTP TakenotesClient + Hono + CoreNoteService + LinuxHostFilesystem", async () => {
    const h = await makeHttpHarness();
    const ws: CoreWorkspace = { root: h.root, kind: "linux-local" };
    const service = {
      read: async (_ws: CoreWorkspace, relativePath: string) => {
        const out = await h.client.noteRead(h.workspace.workspaceId, relativePath);
        return out.ok ? { result: out.result } : { error: out.error };
      },
      update: async (
        _ws: CoreWorkspace,
        relativePath: string,
        content: string,
        expectedHash: string,
        newlineStyle: "lf" | "crlf",
        hadBom: boolean,
      ) => {
        const out = await h.client.noteUpdate({
          workspaceId: h.workspace.workspaceId,
          relativePath,
          content,
          expectedHash,
          newlineStyle,
          hadBom,
        });
        return out.ok ? { revision: out.result } : { error: out.error };
      },
    };
    try {
      (globalThis as unknown as { __takenotesHttpRoots?: string[] }).__takenotesHttpRoots ??= [];
      (globalThis as unknown as { __takenotesHttpRoots: string[] }).__takenotesHttpRoots.push(h.root, h.appRoot);
    } catch {
      /* ignore */
    }
    return { service, ws, root: h.root };
  });

  it("cleans HTTP temp roots", () => {
    const roots = (globalThis as unknown as { __takenotesHttpRoots?: string[] }).__takenotesHttpRoots ?? [];
    for (const r of roots) rmSync(r, { recursive: true, force: true });
  });
});

describe("Gate B HTTP parity proof", () => {
  it("returns the same IpcResult/FileReadResult as IPC for note.read", async () => {
    const root = tempRoot("takenotes-parity-");
    try {
      writeFileSync(join(root, "same.md"), "same\n");
      const { workspaces, notes } = makeIpcNotes();
      const ipcWorkspace = workspaces.registerLocal("Notes", root, "linux-local");
      const h = await makeHttpHarness(root);

      const ipc = readToIpc(await notes.readFile(ipcWorkspace.id, "same.md"));
      const http = await h.client.noteRead(h.workspace.workspaceId, "same.md");

      expect(http).toStrictEqual(ipc);
      rmSync(h.appRoot, { recursive: true, force: true });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns the same revision result as IPC observes after note.update", async () => {
    const root = tempRoot("takenotes-parity-");
    try {
      writeFileSync(join(root, "update.md"), "v1\n");
      const { workspaces, notes } = makeIpcNotes();
      const ipcWorkspace = workspaces.registerLocal("Notes", root, "linux-local");
      const h = await makeHttpHarness(root);

      const read = await notes.readFile(ipcWorkspace.id, "update.md");
      expect("result" in read).toBe(true);
      if (!("result" in read)) return;
      const http = await h.client.noteUpdate({
        workspaceId: h.workspace.workspaceId,
        relativePath: "update.md",
        content: "v2\n",
        expectedHash: read.result.revision.hash,
        newlineStyle: read.result.newlineStyle,
        hadBom: read.result.hadBom,
      });
      const ipcReadAfter = await notes.readFile(ipcWorkspace.id, "update.md");
      expect(http.ok).toBe(true);
      expect(readToIpc(ipcReadAfter).ok).toBe(true);
      if (http.ok && "result" in ipcReadAfter) {
        expect(http.result).toStrictEqual(ipcReadAfter.result.revision);
      }
      rmSync(h.appRoot, { recursive: true, force: true });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("matches IPC AppError.code for errors and CONFLICT", async () => {
    const root = tempRoot("takenotes-parity-");
    try {
      const { workspaces, notes } = makeIpcNotes();
      const ipcWorkspace = workspaces.registerLocal("Notes", root, "linux-local");
      const h = await makeHttpHarness(root);

      expect(await h.client.noteRead(h.workspace.workspaceId, "missing.md")).toMatchObject(
        readToIpc(await notes.readFile(ipcWorkspace.id, "missing.md")),
      );
      expect(await h.client.noteRead(h.workspace.workspaceId, "../secret.md")).toMatchObject(
        readToIpc(await notes.readFile(ipcWorkspace.id, "../secret.md")),
      );

      writeFileSync(join(root, "conflict.md"), "v1\n");
      const ipcRead = await notes.readFile(ipcWorkspace.id, "conflict.md");
      const httpRead = await h.client.noteRead(h.workspace.workspaceId, "conflict.md");
      expect(httpRead).toStrictEqual(readToIpc(ipcRead));
      if (!httpRead.ok || !("result" in ipcRead)) return;
      writeFileSync(join(root, "conflict.md"), "v2-external\n");

      const ipcConflict = revisionToIpc(
        await notes.writeFile(ipcWorkspace.id, "conflict.md", "v3-stale\n", ipcRead.result.revision.hash, ipcRead.result.newlineStyle, ipcRead.result.hadBom),
      );
      const httpConflict = await h.client.noteUpdate({
        workspaceId: h.workspace.workspaceId,
        relativePath: "conflict.md",
        content: "v3-stale\n",
        expectedHash: httpRead.result.revision.hash,
        newlineStyle: httpRead.result.newlineStyle,
        hadBom: httpRead.result.hadBom,
      });
      expect(httpConflict).toMatchObject(ipcConflict);
      expect(httpConflict).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
      rmSync(h.appRoot, { recursive: true, force: true });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires auth session and CSRF for RPC", async () => {
    const h = await makeHttpHarness();
    try {
      const noAuth = await h.app.request("http://takenotes.test/api/rpc/note.read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: h.workspace.workspaceId, relativePath: "a.md" }),
      });
      expect(noAuth.status).toBe(401);
      expect(await noAuth.json()).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });

      const noCsrf = await h.app.request("http://takenotes.test/api/rpc/note.read", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: h.auth.cookieHeader() },
        body: JSON.stringify({ workspaceId: h.workspace.workspaceId, relativePath: "a.md" }),
      });
      expect(noCsrf.status).toBe(403);
      expect(await noCsrf.json()).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    } finally {
      rmSync(h.root, { recursive: true, force: true });
      rmSync(h.appRoot, { recursive: true, force: true });
    }
  });

  it("persists workspaceId across registry/server restart", async () => {
    const root = tempRoot("takenotes-persist-root-");
    const appRoot = tempRoot("takenotes-persist-app-");
    try {
      writeFileSync(join(root, "persist.md"), "persisted\n");
      const registryPath = join(appRoot, "app", "workspaces.json");
      const registry1 = new PersistentServerWorkspaceRegistry(registryPath);
      const workspace1 = await registry1.registerLinuxWorkspace("Notes", root);

      const registry2 = new PersistentServerWorkspaceRegistry(registryPath);
      expect(registry2.get(workspace1.workspaceId)).toMatchObject({ workspaceId: workspace1.workspaceId, root });

      const auth = new SingleOwnerAuth({ session: { sessionId: "owner-session", csrfToken: "csrf-token" } });
      const app = createTakenotesServer({ registry: registry2, auth });
      const client = new TakenotesClient({ baseUrl: "http://takenotes.test", fetch: honoFetch(app), session: auth.session });
      const out = await client.noteRead(workspace1.workspaceId, "persist.md");
      expect(out).toMatchObject({ ok: true, result: { content: "persisted\n" } });
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(appRoot, { recursive: true, force: true });
    }
  });
});
