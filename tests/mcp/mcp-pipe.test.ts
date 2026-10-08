import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect, type Socket } from "node:net";
import { describe, expect, it } from "vitest";
import { appError } from "@takenotes/contracts/errors";
import { encodeFrame, FrameDecoder } from "@takenotes/contracts/protocol";
import { MAX_FRAME_BYTES } from "@takenotes/contracts/protocol-version";
import { emptyActivityLog } from "@takenotes/core/mcp/activity";
import { emptyGrantStore, grantAccess } from "@takenotes/core/mcp/grants";
import type { McpPorts } from "@takenotes/core/mcp/dispatch";
import { loadMcpActivity, loadMcpGrants, saveMcpGrants } from "@takenotes/desktop/main/services/mcp-store";
import { startMcpPipeServer } from "@takenotes/desktop/main/services/mcp-pipe";

function fakePorts(): McpPorts {
  return {
    listWorkspaces: async () => [],
    getWorkspace: async (id) => (id === "w1" ? { id, displayName: "One", kind: "linux-local" } : null),
    listNotes: async () => ({ result: { paths: [] } }),
    readNote: async () => ({ error: appError("NOT_FOUND", "Missing.") }),
    createNote: async () => ({ error: appError("INVALID_REQUEST", "No.") }),
    updateNote: async () => ({ error: appError("CONFLICT", "Stale.") }),
    searchNotes: async () => ({ result: { matches: [] } }),
    listTasks: async () => ({ result: { tasks: [] } }),
    createTask: async (_w, input) => ({ result: { task: { id: "t1", description: input.description, completed: false } } }),
    updateTask: async (_w, taskId) => ({ result: { task: { id: taskId, description: "x", completed: false } } }),
    completeTask: async (_w, taskId) => ({ result: { task: { id: taskId, description: "x", completed: true } } }),
    listEvents: async () => ({ result: { events: [] } }),
    createEvent: async (_w, input) => ({ result: { event: { id: "e1", start: input.start } } }),
    updateEvent: async (_w, eventId) => ({ result: { event: { id: eventId, start: "2026-10-01" } } }),
    readDaily: async (_w, date) => ({ result: { path: `Daily/${date}.md`, exists: false } }),
    appendDaily: async (_w, date) => ({ result: { path: `Daily/${date}.md` } }),
  };
}

function readFrames(socket: Socket): { frames: unknown[]; done: Promise<void> } {
  const decoder = new FrameDecoder(MAX_FRAME_BYTES);
  const frames: unknown[] = [];
  const done = new Promise<void>((resolve) => {
    socket.on("data", (chunk: Buffer) => {
      const { frames: fresh } = decoder.push(chunk);
      frames.push(...fresh);
    });
    socket.on("close", () => resolve());
  });
  return { frames, done };
}

describe("mcp pipe transport", () => {
  it("round-trips a granted call over frames, then denies cleanly", async () => {
    const dir = mkdtempSync(join(tmpdir(), "takenotes-mcppipe-"));
    const socketPath = join(dir, "mcp.sock");
    const grants = emptyGrantStore();
    grantAccess(grants, "codex", "w1", 5);
    const log = emptyActivityLog();
    const server = await startMcpPipeServer({ socketPath, ports: fakePorts(), grants, log, activityDir: dir });
    try {
      const socket = connect(socketPath);
      const seen = readFrames(socket);
      // Partial header first: the decoder must assemble, not error.
      const frame = encodeFrame({ requestId: "r1", clientId: "codex", tool: "workspace_get", params: { workspaceId: "w1" } });
      socket.write(frame.subarray(0, 2));
      await new Promise((r) => setTimeout(r, 20));
      socket.write(frame.subarray(2));
      const denied = encodeFrame({ requestId: "r2", clientId: "codex", tool: "note_delete", params: {} });
      const garbage = encodeFrame({ requestId: "", clientId: "", tool: "", params: {} });
      await new Promise((r) => setTimeout(r, 100));
      socket.write(Buffer.concat([denied, garbage]));
      await new Promise((r) => setTimeout(r, 200));
      socket.end();
      await seen.done;
      const byId = new Map(seen.frames.map((f) => [(f as { requestId: string }).requestId, f]));
      expect((byId.get("r1") as { ok: boolean }).ok).toBe(true);
      expect((byId.get("r2") as { ok: boolean; error: { code: string } }).error.code).toBe("INVALID_REQUEST");
      // Activity flushed to disk (best-effort but local, so present).
      const persisted = await loadMcpActivity(dir);
      expect(persisted.entries.length).toBeGreaterThan(0);
    } finally {
      await server.stop();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("destroys the connection on an oversized frame", async () => {
    const dir = mkdtempSync(join(tmpdir(), "takenotes-mcppipe-"));
    const socketPath = join(dir, "mcp.sock");
    const server = await startMcpPipeServer({ socketPath, ports: fakePorts(), grants: emptyGrantStore() });
    try {
      const socket = connect(socketPath);
      const seen = readFrames(socket);
      const header = Buffer.alloc(4);
      header.writeUInt32BE(MAX_FRAME_BYTES + 1, 0);
      socket.write(header);
      await seen.done;
      expect(seen.frames.length).toBeGreaterThan(0);
    } finally {
      await server.stop();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("mcp store", () => {
  it("grants round-trip; corrupt files fail closed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "takenotes-mcpstore-"));
    try {
      const grants = emptyGrantStore();
      grantAccess(grants, "c", "w", 3);
      expect(await saveMcpGrants(dir, grants)).toBe(true);
      const back = await loadMcpGrants(dir);
      expect(back.grants).toHaveLength(1);
      const { writeFileSync } = await import("node:fs");
      writeFileSync(join(dir, "mcp-grants.json"), "corrupt{");
      expect((await loadMcpGrants(dir)).grants).toEqual([]);
      rmSync(join(dir, "mcp-grants.json"), { force: true });
      expect((await loadMcpGrants(dir)).grants).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
