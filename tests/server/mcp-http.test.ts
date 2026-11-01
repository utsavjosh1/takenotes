import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTakenotesServer } from "@takenotes/server/app";
import { SingleOwnerAuth } from "@takenotes/server/auth";
import { AgentTokenStore } from "@takenotes/server/agent-tokens";
import { PersistentServerWorkspaceRegistry } from "@takenotes/server/workspace-registry";
import type { McpActivityEntry } from "@takenotes/core/mcp/activity";

async function harness(rate?: { perTokenPerMinute?: number; failuresPerClientPerMinute?: number }) {
  const clock = { t: 1_000_000 };
  const base = mkdtempSync(join(tmpdir(), "takenotes-mcphttp-"));
  const root = join(base, "notes");
  const other = join(base, "other");
  mkdirSync(root, { recursive: true });
  mkdirSync(other, { recursive: true });
  const registry = new PersistentServerWorkspaceRegistry(join(base, "app", "workspaces.json"));
  const ws = await registry.registerLinuxWorkspace("Notes", root);
  const ws2 = await registry.registerLinuxWorkspace("Other", other);
  const tokens = AgentTokenStore.forAppDir(join(base, "app"));
  const activity: McpActivityEntry[] = [];
  const owner = new SingleOwnerAuth();
  const app = createTakenotesServer({
    registry,
    auth: owner,
    agentTokens: tokens,
    mcpRate: { ...rate, now: () => clock.t },
    onMcpActivity: (e) => void activity.push(e),
  });
  const rpc = (token: string | null, body: unknown, headers: Record<string, string> = {}) =>
    app.request("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: JSON.stringify(body),
    });
  const call = async (token: string, name: string, args: Record<string, unknown>) => {
    const res = await rpc(token, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
    return (await res.json()) as { result?: { isError?: boolean; content: { text: string }[] }; error?: { message: string } };
  };
  const owned = (route: string, body: unknown, headers: Record<string, string> = owner.headers()) =>
    app.request(`/api/rpc/${route}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  return { base, root, ws, ws2, tokens, activity, app, rpc, call, clock, owned, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

describe("MCP over HTTP (ADR-0017)", () => {
  it("rejects missing, malformed and unknown tokens with 401", async () => {
    const h = await harness();
    try {
      const body = { jsonrpc: "2.0", id: 1, method: "tools/list" };
      expect((await h.rpc(null, body)).status).toBe(401);
      expect((await h.rpc("tn_agent_nope", body)).status).toBe(401);
      expect((await h.rpc("not-a-token", body)).status).toBe(401);
    } finally {
      h.cleanup();
    }
  });

  it("refuses browser origins even with a valid token", async () => {
    const h = await harness();
    try {
      const { token } = await h.tokens.create({ label: "claude", workspaceIds: [h.ws.workspaceId], scope: "write" });
      const res = await h.rpc(token, { jsonrpc: "2.0", id: 1, method: "tools/list" }, { origin: "https://evil.example" });
      expect(res.status).toBe(403);
    } finally {
      h.cleanup();
    }
  });

  it("lists tools without a handshake and returns 202 for notifications", async () => {
    const h = await harness();
    try {
      const { token } = await h.tokens.create({ label: "claude", workspaceIds: [h.ws.workspaceId], scope: "write" });
      const list = (await (await h.rpc(token, { jsonrpc: "2.0", id: 1, method: "tools/list" })).json()) as {
        result: { tools: { name: string }[] };
      };
      expect(list.result.tools.map((t) => t.name)).toContain("note_create");
      const note = await h.rpc(token, { jsonrpc: "2.0", method: "notifications/initialized" });
      expect(note.status).toBe(202);
    } finally {
      h.cleanup();
    }
  });

  it("creates, reads and updates notes with the revision CONFLICT contract", async () => {
    const h = await harness();
    try {
      const { token } = await h.tokens.create({ label: "claude", workspaceIds: [h.ws.workspaceId], scope: "write" });
      const wid = h.ws.workspaceId;
      const created = await h.call(token, "note_create", { workspaceId: wid, path: "plan.md", content: "# Plan\n" });
      expect(created.result?.isError).toBeUndefined();
      expect(readFileSync(join(h.root, "plan.md"), "utf8")).toBe("# Plan\n");

      const read = await h.call(token, "note_read", { workspaceId: wid, path: "plan.md" });
      const hash = (JSON.parse(read.result!.content[0]!.text) as { revision: { hash: string } }).revision.hash;

      const stale = await h.call(token, "note_update", { workspaceId: wid, path: "plan.md", content: "x", expectedRevision: "dead" });
      expect(stale.result?.isError).toBe(true);
      expect(stale.result?.content[0]?.text).toContain("CONFLICT");

      const fresh = await h.call(token, "note_update", { workspaceId: wid, path: "plan.md", content: "# Plan v2\n", expectedRevision: hash });
      expect(fresh.result?.isError).toBeUndefined();
      expect(readFileSync(join(h.root, "plan.md"), "utf8")).toBe("# Plan v2\n");
    } finally {
      h.cleanup();
    }
  });

  it("scopes a token to its workspaces (no existence leak)", async () => {
    const h = await harness();
    try {
      const { token } = await h.tokens.create({ label: "claude", workspaceIds: [h.ws.workspaceId], scope: "write" });
      const denied = await h.call(token, "note_list", { workspaceId: h.ws2.workspaceId });
      expect(denied.result?.isError).toBe(true);
      expect(denied.result?.content[0]?.text).toContain("PERMISSION_DENIED");
      const listed = await h.call(token, "workspace_list", {});
      const ids = (JSON.parse(listed.result!.content[0]!.text) as { workspaces: { id: string }[] }).workspaces.map((w) => w.id);
      expect(ids).toEqual([h.ws.workspaceId]);
    } finally {
      h.cleanup();
    }
  });

  it("read-only tokens can read but never mutate", async () => {
    const h = await harness();
    try {
      writeFileSync(join(h.root, "a.md"), "hello");
      const { token } = await h.tokens.create({ label: "viewer", workspaceIds: [h.ws.workspaceId], scope: "read" });
      const wid = h.ws.workspaceId;
      expect((await h.call(token, "note_read", { workspaceId: wid, path: "a.md" })).result?.isError).toBeUndefined();
      for (const [tool, args] of [
        ["note_create", { path: "b.md", content: "x" }],
        ["task_create", { description: "do it" }],
        ["daily_append", { date: "2026-01-02", content: "x" }],
      ] as const) {
        const out = await h.call(token, tool, { workspaceId: wid, ...args });
        expect(out.result?.isError, tool).toBe(true);
        expect(out.result?.content[0]?.text, tool).toContain("read-only");
      }
      expect(() => readFileSync(join(h.root, "b.md"))).toThrow();
    } finally {
      h.cleanup();
    }
  });

  it("revocation takes effect on a running server, including tokens made by another process", async () => {
    const h = await harness();
    try {
      const { token, record } = await h.tokens.create({ label: "claude", workspaceIds: [h.ws.workspaceId], scope: "write" });
      const body = { jsonrpc: "2.0", id: 1, method: "tools/list" };
      expect((await h.rpc(token, body)).status).toBe(200);
      // A second store instance stands in for the CLI process editing the same file.
      const cli = AgentTokenStore.forAppDir(join(h.base, "app"));
      expect(await cli.revoke(record.id)).toBe(true);
      expect((await h.rpc(token, body)).status).toBe(401);
    } finally {
      h.cleanup();
    }
  });

  it("stores only a hash and never persists the raw token", async () => {
    const h = await harness();
    try {
      const { token } = await h.tokens.create({ label: "claude", workspaceIds: [h.ws.workspaceId], scope: "write" });
      const file = readFileSync(join(h.base, "app", "agent-tokens.json"), "utf8");
      expect(file).not.toContain(token);
      expect(token.startsWith("tn_agent_")).toBe(true);
    } finally {
      h.cleanup();
    }
  });

  it("writes an activity row per call, including read-only denials", async () => {
    const h = await harness();
    try {
      const { token } = await h.tokens.create({ label: "viewer", workspaceIds: [h.ws.workspaceId], scope: "read" });
      await h.call(token, "workspace_list", {});
      await h.call(token, "note_create", { workspaceId: h.ws.workspaceId, path: "x.md", content: "x" });
      expect(h.activity.map((e) => [e.clientId, e.tool, e.ok])).toEqual([
        ["viewer", "workspace_list", true],
        ["viewer", "note_create", false],
      ]);
    } finally {
      h.cleanup();
    }
  });

  it("rejects oversized bodies, batches and GET", async () => {
    const h = await harness();
    try {
      const { token } = await h.tokens.create({ label: "claude", workspaceIds: [h.ws.workspaceId], scope: "write" });
      const big = await h.rpc(token, { jsonrpc: "2.0", id: 1, method: "ping", params: { pad: "x".repeat(1024 * 1024 + 1) } });
      expect(big.status).toBe(413);
      const batch = await h.rpc(token, [{ jsonrpc: "2.0", id: 1, method: "ping" }]);
      expect(batch.status).toBe(400);
      expect((await h.app.request("/mcp", { method: "GET" })).status).toBe(405);
    } finally {
      h.cleanup();
    }
  });

  it("is off unless agent tokens are configured", async () => {
    const base = mkdtempSync(join(tmpdir(), "takenotes-mcpoff-"));
    try {
      const registry = new PersistentServerWorkspaceRegistry(join(base, "w.json"));
      const app = createTakenotesServer({ registry, auth: new SingleOwnerAuth() });
      const res = await app.request("/mcp", { method: "POST", body: "{}" });
      expect(res.status).toBe(404);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("rate-limits each token and recovers when the window passes", async () => {
    const h = await harness({ perTokenPerMinute: 3 });
    try {
      const a = await h.tokens.create({ label: "a", workspaceIds: [h.ws.workspaceId], scope: "write" });
      const b = await h.tokens.create({ label: "b", workspaceIds: [h.ws.workspaceId], scope: "write" });
      const ping = { jsonrpc: "2.0", id: 1, method: "ping" };
      for (let i = 0; i < 3; i++) expect((await h.rpc(a.token, ping)).status).toBe(200);
      const limited = await h.rpc(a.token, ping);
      expect(limited.status).toBe(429);
      expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
      // Another token is unaffected.
      expect((await h.rpc(b.token, ping)).status).toBe(200);
      h.clock.t += 61_000;
      expect((await h.rpc(a.token, ping)).status).toBe(200);
    } finally {
      h.cleanup();
    }
  });

  it("locks out a client after repeated bad tokens, even for a valid one", async () => {
    const h = await harness({ failuresPerClientPerMinute: 3 });
    try {
      const { token } = await h.tokens.create({ label: "claude", workspaceIds: [h.ws.workspaceId], scope: "write" });
      const ping = { jsonrpc: "2.0", id: 1, method: "ping" };
      for (let i = 0; i < 4; i++) expect((await h.rpc("tn_agent_guess" + i, ping)).status).toBe(401);
      expect((await h.rpc(token, ping)).status).toBe(429);
      h.clock.t += 61_000;
      expect((await h.rpc(token, ping)).status).toBe(200);
    } finally {
      h.cleanup();
    }
  });

  it("agents API requires the owner session and CSRF", async () => {
    const h = await harness();
    try {
      expect((await h.owned("agents.list", {}, {})).status).toBe(401);
      const noCsrf = { cookie: new SingleOwnerAuth().cookieHeader() };
      expect((await h.owned("agents.list", {}, noCsrf)).status).toBe(401);
    } finally {
      h.cleanup();
    }
  });

  it("owner can create, use, list and revoke a token through the agents API", async () => {
    const h = await harness();
    try {
      const created = (await (
        await h.owned("agents.create", { label: "web-made", workspaceIds: [h.ws.workspaceId], scope: "read" })
      ).json()) as { ok: boolean; result: { token: string; record: { id: string; scope: string } } };
      expect(created.ok).toBe(true);
      expect(created.result.record.scope).toBe("read");
      const { token, record } = created.result;

      expect((await h.rpc(token, { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(200);

      const listed = (await (await h.owned("agents.list", {})).json()) as { result: Record<string, unknown>[] };
      expect(listed.result.map((t) => t.label)).toEqual(["web-made"]);
      expect(JSON.stringify(listed)).not.toContain(token);
      expect(JSON.stringify(listed)).not.toContain("hash");

      const revoked = (await (await h.owned("agents.revoke", { id: record.id })).json()) as { ok: boolean };
      expect(revoked.ok).toBe(true);
      expect((await h.rpc(token, { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(401);
      const again = (await (await h.owned("agents.revoke", { id: record.id })).json()) as { ok: boolean };
      expect(again.ok).toBe(false);
    } finally {
      h.cleanup();
    }
  });

  it("agents API rejects missing labels and unknown workspaces", async () => {
    const h = await harness();
    try {
      for (const body of [
        { label: "", workspaceIds: [h.ws.workspaceId] },
        { label: "x", workspaceIds: [] },
        { label: "x", workspaceIds: ["no-such-workspace"] },
      ]) {
        const out = (await (await h.owned("agents.create", body)).json()) as { ok: boolean };
        expect(out.ok).toBe(false);
      }
      expect(await h.tokens.list()).toEqual([]);
    } finally {
      h.cleanup();
    }
  });
});
