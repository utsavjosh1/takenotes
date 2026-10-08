import { describe, expect, it } from "vitest";
import { appError } from "@takenotes/contracts/errors";
import { emptyActivityLog } from "@takenotes/core/mcp/activity";
import { dispatchMcpTool, type McpPorts } from "@takenotes/core/mcp/dispatch";
import { emptyGrantStore, grantAccess } from "@takenotes/core/mcp/grants";

function fakePorts(): McpPorts & {
  notes: Map<string, { content: string; hash: string }>;
} {
  const notes = new Map<string, { content: string; hash: string }>([
    ["a.md", { content: "hello", hash: "h1" }],
  ]);
  return {
    notes,
    listWorkspaces: async () => [
      { id: "w1", displayName: "One", kind: "linux-local" },
      { id: "w2", displayName: "Two", kind: "linux-local" },
    ],
    getWorkspace: async (id) =>
      id === "w1"
        ? { id: "w1", displayName: "One", kind: "linux-local" }
        : id === "w2"
          ? { id: "w2", displayName: "Two", kind: "linux-local" }
          : null,
    listNotes: async () => ({ result: { paths: [...notes.keys()] } }),
    readNote: async (_w, path) => {
      const hit = notes.get(path);
      if (!hit) return { error: appError("NOT_FOUND", "Not found.") };
      return { result: { content: hit.content, revision: { hash: hit.hash, size: 5, mtimeMs: 1 } } };
    },
    createNote: async (_w, path, content) => {
      if (notes.has(path)) return { error: appError("ALREADY_EXISTS", "Exists.") };
      notes.set(path, { content, hash: "h-new" });
      return { result: { revision: { hash: "h-new", size: content.length, mtimeMs: 2 } } };
    },
    updateNote: async (_w, path, content, expectedRevision) => {
      const hit = notes.get(path);
      if (!hit) return { error: appError("NOT_FOUND", "Not found.") };
      if (hit.hash !== expectedRevision) return { error: appError("CONFLICT", "Stale.") };
      notes.set(path, { content, hash: "h2" });
      return { result: { revision: { hash: "h2", size: content.length, mtimeMs: 3 } } };
    },
    searchNotes: async (_w, query) => {
      if (query === "bad operator @@") return { error: appError("INVALID_REQUEST", "Bad operator.") };
      return { result: { matches: [{ path: "a.md", line: 1, preview: "hello" }] } };
    },
    listTasks: async () => ({
      result: { tasks: [{ id: "t1", description: "x", completed: false }] },
    }),
    createTask: async (_w, input) => ({
      result: { task: { id: "t9", description: input.description, completed: false } },
    }),
    updateTask: async (_w, taskId, patch) => ({
      result: { task: { id: taskId, description: String(patch.description ?? "x"), completed: false } },
    }),
    completeTask: async (_w, taskId) => ({
      result: { task: { id: taskId, description: "x", completed: true } },
    }),
    listEvents: async () => ({
      result: { events: [{ id: "e1", start: "2026-10-01T09:00:00+00:00" }] },
    }),
    createEvent: async (_w, input) => ({ result: { event: { id: "e9", start: input.start } } }),
    updateEvent: async (_w, eventId, patch) => ({
      result: {
        event: { id: eventId, start: String(patch.start ?? "2026-10-01T09:00:00+00:00") },
      },
    }),
    readDaily: async (_w, date) => ({ result: { path: `Daily/${date}.md`, exists: false } }),
    appendDaily: async (_w, date) => ({ result: { path: `Daily/${date}.md` } }),
  };
}

function ctx() {
  const ports = fakePorts();
  const grants = emptyGrantStore();
  const log = emptyActivityLog();
  grantAccess(grants, "claude", "w1", 1000);
  return { ports, grants, log, now: () => 4242 };
}

describe("mcp dispatch", () => {
  it("workspace_list reveals only granted workspaces, drops stale grants", async () => {
    const c = ctx();
    grantAccess(c.grants, "claude", "w-gone", 1001);
    const out = await dispatchMcpTool(c, "claude", "workspace_list", {});
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result).toEqual({ workspaces: [{ id: "w1", displayName: "One", kind: "linux-local" }] });
  });

  it("denies without leaking existence (no grant vs unknown workspace)", async () => {
    const c = ctx();
    const a = await dispatchMcpTool(c, "claude", "note_read", { workspaceId: "w2", path: "a.md" });
    const b = await dispatchMcpTool(c, "claude", "note_read", { workspaceId: "w-nope", path: "a.md" });
    expect(a).toEqual(b);
    if (!a.ok) expect(a.error.code).toBe("PERMISSION_DENIED");
  });

  it("rejects blank client, unknown and deferred tools, missing params", async () => {
    const c = ctx();
    const blank = await dispatchMcpTool(c, "  ", "note_read", { workspaceId: "w1", path: "a.md" });
    expect(blank.ok).toBe(false);
    const unknown = await dispatchMcpTool(c, "claude", "drop_table", {});
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.message).toMatch(/Unknown MCP tool/);
    const deferred = await dispatchMcpTool(c, "claude", "note_delete", { workspaceId: "w1" });
    if (!deferred.ok) {
      expect(deferred.error.code).toBe("INVALID_REQUEST");
      expect(deferred.error.message).toMatch(/deferred/);
    } else {
      expect.unreachable();
    }
    const missing = await dispatchMcpTool(c, "claude", "note_read", { workspaceId: "w1" });
    if (!missing.ok) expect(missing.error.message).toMatch(/path/);
    else expect.unreachable();
    // Blank-client denial is not attributable: no activity row.
    expect(c.log.entries).toHaveLength(3);
  });

  it("note_read/update round-trip with CONFLICT passthrough", async () => {
    const c = ctx();
    const read = await dispatchMcpTool(c, "claude", "note_read", { workspaceId: "w1", path: "a.md" });
    expect(read.ok).toBe(true);
    const stale = await dispatchMcpTool(c, "claude", "note_update", {
      workspaceId: "w1",
      path: "a.md",
      content: "new",
      expectedRevision: "h-stale",
    });
    if (!stale.ok) expect(stale.error.code).toBe("CONFLICT");
    else expect.unreachable();
    const fresh = await dispatchMcpTool(c, "claude", "note_update", {
      workspaceId: "w1",
      path: "a.md",
      content: "new",
      expectedRevision: "h1",
    });
    expect(fresh.ok).toBe(true);
  });

  it("search/task/calendar/daily tools dispatch with honest errors", async () => {
    const c = ctx();
    expect((await dispatchMcpTool(c, "claude", "search_notes", { workspaceId: "w1", query: "hello" })).ok).toBe(true);
    const badQuery = await dispatchMcpTool(c, "claude", "search_notes", {
      workspaceId: "w1",
      query: "bad operator @@",
    });
    if (!badQuery.ok) expect(badQuery.error.code).toBe("INVALID_REQUEST");
    else expect.unreachable();
    expect((await dispatchMcpTool(c, "claude", "task_complete", { workspaceId: "w1", taskId: "t1" })).ok).toBe(true);
    expect(
      (await dispatchMcpTool(c, "claude", "calendar_create", { workspaceId: "w1", start: "2026-10-01T09:00:00+00:00" })).ok,
    ).toBe(true);
    expect((await dispatchMcpTool(c, "claude", "daily_read", { workspaceId: "w1", date: "2026-10-08" })).ok).toBe(true);
    const badDate = await dispatchMcpTool(c, "claude", "daily_append", {
      workspaceId: "w1",
      date: "tomorrow",
      content: "x",
    });
    if (!badDate.ok) expect(badDate.error.message).toMatch(/YYYY-MM-DD/);
    else expect.unreachable();
    const appended = await dispatchMcpTool(c, "claude", "daily_append", {
      workspaceId: "w1",
      date: "2026-10-08",
      content: "- [ ] call",
    });
    expect(appended.ok).toBe(true);
  });

  it("logs ok + denial rows with timestamps and error codes", async () => {
    const c = ctx();
    await dispatchMcpTool(c, "claude", "note_list", { workspaceId: "w1" });
    await dispatchMcpTool(c, "claude", "note_read", { workspaceId: "w2", path: "a.md" });
    expect(c.log.entries).toHaveLength(2);
    expect(c.log.entries[0]).toMatchObject({ clientId: "claude", tool: "note_list", ok: true, at: 4242 });
    expect(c.log.entries[1]).toMatchObject({
      clientId: "claude",
      tool: "note_read",
      ok: false,
      errorCode: "PERMISSION_DENIED",
    });
  });
});
