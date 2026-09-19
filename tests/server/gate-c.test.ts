/**
 * Gate C proof: deployment-ready auth + real remote-client lifecycle.
 *
 * Covers the acceptance boundary and nothing beyond it:
 * login → workspace registry → open/edit/save → CONFLICT → logout/expiry,
 * cookie contract (Secure/HttpOnly/SameSite=Strict/Path=/, no Domain,
 * __Host- production vs plain-HTTP relaxation), authGeneration on password
 * change, restart persistence under one /data dir, health/readiness.
 *
 * Out of scope (not tested, not implemented): Tasks, Search migration,
 * remote MCP, offline editing, sync, multi-user, public API docs,
 * WebSocket, Caddy/Tailscale specifics.
 */
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTakenotesServer } from "../../src/server/app.js";
import { FileOwnerAuth } from "../../src/server/auth-store.js";
import { TakenotesClient } from "../../src/server/client.js";
import { PersistentServerWorkspaceRegistry } from "../../src/server/workspace-registry.js";
import { assertProductionCookieContract } from "../../src/server/cookies.js";

const PASSWORD = "correct-horse-battery-staple";
const NEXT_PASSWORD = "rotated-horse-battery-staple";

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function honoFetch(app: ReturnType<typeof createTakenotesServer>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : input.toString();
    return app.request(request, init);
  }) as typeof fetch;
}

type Harness = {
  dataDir: string;
  appDir: string;
  workspacesDir: string;
  auth: FileOwnerAuth;
  registry: PersistentServerWorkspaceRegistry;
  workspaceId: string;
  app: ReturnType<typeof createTakenotesServer>;
  client: TakenotesClient;
  insecure: boolean;
};

async function makeHarness(options: { insecure?: boolean; sessionTtlMs?: number } = {}): Promise<Harness> {
  const insecure = options.insecure ?? true;
  const dataDir = tempDir("takenotes-gatec-");
  const appDir = join(dataDir, "app");
  const workspacesDir = join(dataDir, "workspaces");
  await FileOwnerAuth.bootstrap(appDir, PASSWORD);
  const auth = await FileOwnerAuth.open({ appDir, insecureHttp: insecure, sessionTtlMs: options.sessionTtlMs });
  const registry = new PersistentServerWorkspaceRegistry(join(appDir, "workspaces.json"));
  const ws = await registry.registerManagedWorkspace("Notes", workspacesDir, "notes");
  writeFileSync(join(ws.root, "README.md"), "# Notes\n");
  const app = createTakenotesServer({ registry, auth, authStore: auth, version: "test" });
  const client = new TakenotesClient({ baseUrl: "http://takenotes.test", fetch: honoFetch(app) });
  return { dataDir, appDir, workspacesDir, auth, registry, workspaceId: ws.workspaceId, app, client, insecure };
}

function cleanup(h: Harness): void {
  rmSync(h.dataDir, { recursive: true, force: true });
}

describe("Gate C cookie contract", () => {
  it("production Set-Cookie satisfies the locked contract", async () => {
    const h = await makeHarness({ insecure: false });
    try {
      const res = await h.app.request("http://takenotes.test/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: PASSWORD }),
      });
      expect(res.status).toBe(200);
      const setCookie = res.headers.get("set-cookie") ?? "";
      expect(() => assertProductionCookieContract(setCookie)).not.toThrow();
    } finally {
      cleanup(h);
    }
  });

  it("insecure relaxation keeps everything except __Host-/Secure", async () => {
    const h = await makeHarness({ insecure: true });
    try {
      const res = await h.app.request("http://takenotes.test/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: PASSWORD }),
      });
      const setCookie = res.headers.get("set-cookie") ?? "";
      expect(setCookie.startsWith("takenotes-session=")).toBe(true);
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Strict");
      expect(setCookie).toContain("Path=/");
      expect(setCookie).not.toMatch(/;\s*Secure([;\s]|$)/i);
      expect(setCookie).not.toMatch(/;\s*Domain=/i);
    } finally {
      cleanup(h);
    }
  });

  it("logout clears the cookie with identical scope", async () => {
    const h = await makeHarness({ insecure: false });
    try {
      await h.client.login(PASSWORD);
      const res = await honoFetch(h.app)(new URL("/api/auth/logout", "http://takenotes.test"), {
        method: "POST",
        headers: { "content-type": "application/json", cookie: `${h.auth.cookieName}=${h.client.session!.sessionId}`, "x-csrf-token": h.client.session!.csrfToken },
        body: JSON.stringify({}),
      });
      const setCookie = res.headers.get("set-cookie") ?? "";
      expect(setCookie).toContain("Max-Age=0");
      expect(() => assertProductionCookieContract(setCookie)).not.toThrow();
    } finally {
      cleanup(h);
    }
  });
});

describe("Gate C remote-client proof", () => {
  it("login → list → open → edit → save with revision semantics", async () => {
    const h = await makeHarness();
    try {
      expect(await h.client.listWorkspaces()).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
      const bad = await h.client.login("wrong-password-000000");
      expect(bad.ok).toBe(false);

      const login = await h.client.login(PASSWORD);
      expect(login.ok).toBe(true);

      const list = await h.client.listWorkspaces();
      expect(list).toMatchObject({ ok: true, result: [{ displayName: "Notes" }] });
      if (!list.ok) return;
      expect(list.result[0]!.workspaceId).toBe(h.workspaceId);
      // No absolute roots leak to the remote client.
      expect(JSON.stringify(list)).not.toContain(h.workspacesDir);

      const read = await h.client.noteRead(h.workspaceId, "README.md");
      expect(read).toMatchObject({ ok: true, result: { content: "# Notes\n" } });
      if (!read.ok) return;

      const updated = await h.client.noteUpdate({
        workspaceId: h.workspaceId,
        relativePath: "README.md",
        content: "# Notes\n\nEdited remotely.\n",
        expectedHash: read.result.revision.hash,
        newlineStyle: read.result.newlineStyle,
        hadBom: read.result.hadBom,
      });
      expect(updated.ok).toBe(true);
      const reread = await h.client.noteRead(h.workspaceId, "README.md");
      if (reread.ok && updated.ok) expect(reread.result.revision).toStrictEqual(updated.result);
    } finally {
      cleanup(h);
    }
  });

  it("stale browser save → CONFLICT, external content untouched", async () => {
    const h = await makeHarness();
    try {
      await h.client.login(PASSWORD);
      const read = await h.client.noteRead(h.workspaceId, "README.md");
      if (!read.ok) return;
      // External process changes README.md out from under the browser.
      writeFileSync(join(h.workspacesDir, "notes", "README.md"), "# Notes\n\nExternal change.\n");
      const stale = await h.client.noteUpdate({
        workspaceId: h.workspaceId,
        relativePath: "README.md",
        content: "stale browser write\n",
        expectedHash: read.result.revision.hash,
        newlineStyle: read.result.newlineStyle,
        hadBom: read.result.hadBom,
      });
      expect(stale).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
      expect(readFileSync(join(h.workspacesDir, "notes", "README.md"), "utf8")).toBe("# Notes\n\nExternal change.\n");
    } finally {
      cleanup(h);
    }
  });

  it("logout invalidates the session; CSRF is enforced", async () => {
    const h = await makeHarness();
    try {
      await h.client.login(PASSWORD);
      // Missing CSRF → 403.
      const noCsrf = await h.app.request("http://takenotes.test/api/rpc/note.read", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: `${h.auth.cookieName}=${h.client.session!.sessionId}` },
        body: JSON.stringify({ workspaceId: h.workspaceId, relativePath: "README.md" }),
      });
      expect(noCsrf.status).toBe(403);

      await h.client.logout();
      expect(h.client.session).toBeNull();
      expect(await h.client.noteRead(h.workspaceId, "README.md")).toMatchObject({
        ok: false,
        error: { code: "PERMISSION_DENIED" },
      });
    } finally {
      cleanup(h);
    }
  });

  it("expired sessions fail closed", async () => {
    const h = await makeHarness({ sessionTtlMs: 40 });
    try {
      await h.client.login(PASSWORD);
      expect((await h.client.noteRead(h.workspaceId, "README.md")).ok).toBe(true);
      await new Promise((r) => setTimeout(r, 80));
      expect(await h.client.noteRead(h.workspaceId, "README.md")).toMatchObject({
        ok: false,
        error: { code: "PERMISSION_DENIED" },
      });
    } finally {
      cleanup(h);
    }
  });

  it("serves the browser proof UI and health without auth", async () => {
    const h = await makeHarness();
    try {
      const page = await h.app.request("http://takenotes.test/");
      expect(page.status).toBe(200);
      const html = await page.text();
      expect(html).toContain("/api/auth/login");
      expect(html).toContain("CONFLICT");
      const health = await h.app.request("http://takenotes.test/api/health");
      expect(await health.json()).toMatchObject({ ok: true, result: { status: "ok" } });
    } finally {
      cleanup(h);
    }
  });

  it("disconnected server surfaces instead of hanging", async () => {
    const throwingFetch = (() => {
      throw new Error("fetch failed");
    }) as unknown as typeof fetch;
    const client = new TakenotesClient({ baseUrl: "http://127.0.0.1:9", fetch: throwingFetch });
    await expect(client.noteRead("wid", "README.md")).rejects.toThrow("fetch failed");
  });
});

describe("Gate C restart + rotation", () => {
  it("same /data → same auth, same workspaceId, same contents, live session", async () => {
    const h = await makeHarness();
    try {
      await h.client.login(PASSWORD);
      const read = await h.client.noteRead(h.workspaceId, "README.md");
      if (!read.ok) return;
      await h.client.noteUpdate({
        workspaceId: h.workspaceId,
        relativePath: "README.md",
        content: "# Notes\n\nBefore restart.\n",
        expectedHash: read.result.revision.hash,
        newlineStyle: read.result.newlineStyle,
        hadBom: read.result.hadBom,
      });

      // Simulate container restart: entirely new objects over the same /data.
      const auth2 = await FileOwnerAuth.open({ appDir: h.appDir, insecureHttp: h.insecure });
      const registry2 = new PersistentServerWorkspaceRegistry(join(h.appDir, "workspaces.json"));
      expect(registry2.get(h.workspaceId)).toMatchObject({ workspaceId: h.workspaceId });
      const app2 = createTakenotesServer({ registry: registry2, auth: auth2, authStore: auth2, version: "test" });
      const client2 = new TakenotesClient({ baseUrl: "http://takenotes.test", fetch: honoFetch(app2) });
      // Old session survives the restart (same persisted sessions.json).
      (client2 as unknown as { jar: unknown }).jar = (h.client as unknown as { jar: unknown }).jar;
      const reread = await client2.noteRead(h.workspaceId, "README.md");
      expect(reread).toMatchObject({ ok: true, result: { content: "# Notes\n\nBefore restart.\n" } });
      const list = await client2.listWorkspaces();
      expect(list).toMatchObject({ ok: true, result: [{ workspaceId: h.workspaceId }] });
    } finally {
      cleanup(h);
    }
  });

  it("password change bumps authGeneration and kills old sessions", async () => {
    const h = await makeHarness();
    try {
      await h.client.login(PASSWORD);
      const genBefore = h.auth.authGeneration;
      const changed = await h.client.changePassword(PASSWORD, NEXT_PASSWORD);
      expect(changed).toMatchObject({ ok: true });
      expect(h.auth.authGeneration).toBe(genBefore + 1);

      // Old password dead, old session dead.
      expect((await h.client.login(PASSWORD)).ok).toBe(false);
      expect(await h.client.noteRead(h.workspaceId, "README.md")).toMatchObject({
        ok: false,
        error: { code: "PERMISSION_DENIED" },
      });
      // New password works.
      expect((await h.client.login(NEXT_PASSWORD)).ok).toBe(true);
      expect((await h.client.noteRead(h.workspaceId, "README.md")).ok).toBe(true);
    } finally {
      cleanup(h);
    }
  });

  it("bootstrap is once-only and refuses short passwords", async () => {
    const dir = tempDir("takenotes-gatec-auth-");
    try {
      await expect(FileOwnerAuth.bootstrap(join(dir, "app"), "short")).rejects.toThrow();
      await FileOwnerAuth.bootstrap(join(dir, "app"), PASSWORD);
      await expect(FileOwnerAuth.bootstrap(join(dir, "app"), NEXT_PASSWORD)).rejects.toThrow(/already initialized/);
      await expect(FileOwnerAuth.open({ appDir: join(dir, "missing") })).rejects.toThrow(/TAKENOTES_PASSWORD/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("managed workspaces cannot escape the workspaces directory", async () => {
    const h = await makeHarness();
    try {
      const ws = await h.registry.registerManagedWorkspace("Second", h.workspacesDir, "second");
      expect(ws.root.startsWith(`${h.workspacesDir}/`)).toBe(true);
      // Traversal in the display/dir name is neutralized by slug sanitizing:
      // it must land inside the workspaces dir, never outside it.
      const evil = await h.registry.registerManagedWorkspace("Evil", h.workspacesDir, "../../evil");
      expect(evil.root.startsWith(`${h.workspacesDir}/`)).toBe(true);
    } finally {
      cleanup(h);
    }
  });
});
