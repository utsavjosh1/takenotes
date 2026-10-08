import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dispatchMcpTool } from "@takenotes/core/mcp/dispatch";
import { emptyGrantStore, grantAccess } from "@takenotes/core/mcp/grants";
import { emptyActivityLog } from "@takenotes/core/mcp/activity";
import { NoteService } from "@takenotes/desktop/main/services/note-service";
import { WorkspaceService } from "@takenotes/desktop/main/services/workspace-service";
import { NativeFileAdapter } from "@takenotes/desktop/main/workspace/file-adapter";
import { createMcpPorts } from "@takenotes/desktop/main/services/mcp-host";

function harness() {
  const root = mkdtempSync(join(tmpdir(), "takenotes-mcphost-"));
  const workspaces = new WorkspaceService();
  const notes = new NoteService(workspaces, {
    native: new NativeFileAdapter(async () => {}),
    wslRequest: async () => {
      throw new Error("no wsl in tests");
    },
    hasWslSession: () => true,
  });
  const reg = workspaces.registerLocal("Notes", root, "linux-local");
  const ports = createMcpPorts({ workspaces, notes });
  const grants = emptyGrantStore();
  grantAccess(grants, "claude", reg.id, 1000);
  const log = emptyActivityLog();
  const call = (tool: string, params: unknown) =>
    dispatchMcpTool({ ports, grants, log }, "claude", tool, { workspaceId: reg.id, ...(params as object) });
  return { root, reg, call, log, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

describe("mcp host (real services)", () => {
  it("note crud with revision CONFLICT", async () => {
    const h = harness();
    try {
      expect(((await h.call("note_create", { path: "a.md", content: "hello" })) as { ok: boolean }).ok).toBe(true);
      const read = await h.call("note_read", { path: "a.md" });
      expect(read.ok).toBe(true);
      const hash = (read as { ok: true; result: { revision: { hash: string } } }).result.revision.hash;
      const stale = await h.call("note_update", { path: "a.md", content: "v2", expectedRevision: "dead" });
      expect(stale.ok).toBe(false);
      const fresh = await h.call("note_update", { path: "a.md", content: "v2", expectedRevision: hash });
      expect(fresh.ok).toBe(true);
      const list = await h.call("note_list", {});
      if (list.ok) expect((list.result as { paths: string[] }).paths).toEqual(["a.md"]);
      else expect.unreachable();
    } finally {
      h.cleanup();
    }
  });

  it("search honors the grammar and names bad operators", async () => {
    const h = harness();
    try {
      await h.call("note_create", { path: "shop.md", content: "# Groceries\nbuy oat milk\n" });
      const hit = await h.call("search_notes", { query: "oat" });
      if (!hit.ok) expect.unreachable();
      else expect((hit.result as { matches: { path: string }[] }).matches.map((m) => m.path)).toEqual(["shop.md"]);
      const bad = await h.call("search_notes", { query: "author:me" });
      if (bad.ok) expect.unreachable();
      else {
        expect(bad.error.code).toBe("INVALID_REQUEST");
        expect(bad.error.message).toMatch(/author/);
      }
    } finally {
      h.cleanup();
    }
  });

  it("tasks create/list/complete/update with moved-line honesty", async () => {
    const h = harness();
    try {
      const created = await h.call("task_create", { description: "call mom @due(2026-10-09)" });
      if (!created.ok) expect.unreachable();
      const id = (created.result as { task: { id: string } }).task.id;
      expect(id).toMatch(/Inbox\.md#L\d+/);
      const listed = await h.call("task_list", {});
      if (!listed.ok) expect.unreachable();
      else expect((listed.result as { tasks: unknown[] }).tasks).toHaveLength(1);
      const done = await h.call("task_complete", { taskId: id });
      if (!done.ok) expect.unreachable();
      else expect((done.result as { task: { completed: boolean; due: string } }).task).toMatchObject({ completed: true, due: "2026-10-09" });
      const renamed = await h.call("task_update", { taskId: id, description: "call dad" });
      if (!renamed.ok) expect.unreachable();
      else {
        // New description lands, the @due token survives the rewrite.
        expect((renamed.result as { task: { description: string; due: string } }).task).toMatchObject({
          description: "call dad",
          due: "2026-10-09",
        });
      }
      const bogus = await h.call("task_update", { taskId: id, color: "red" });
      expect(bogus.ok).toBe(false);
    } finally {
      h.cleanup();
    }
  });

  it("calendar create/list/update with range narrowing", async () => {
    const h = harness();
    try {
      const created = await h.call("calendar_create", {
        start: "2026-10-09T09:00:00+00:00",
        title: "Dentist",
      });
      if (!created.ok) expect.unreachable();
      const id = (created.result as { event: { id: string } }).event.id;
      const all = await h.call("calendar_events", {});
      if (!all.ok) expect.unreachable();
      else expect((all.result as { events: { id: string }[] }).events.map((e) => e.id)).toEqual([id]);
      const outside = await h.call("calendar_events", { start: "2027-01-01", end: "2027-12-31" });
      if (!outside.ok) expect.unreachable();
      else expect((outside.result as { events: unknown[] }).events).toEqual([]);
      const renamed = await h.call("calendar_update", { eventId: id, title: "Dentist (moved)" });
      expect(renamed.ok).toBe(true);
      const badField = await h.call("calendar_update", { eventId: id, location: "x" });
      expect(badField.ok).toBe(false);
    } finally {
      h.cleanup();
    }
  });

  it("daily read-missing then append-create then append-concat", async () => {
    const h = harness();
    try {
      const missing = await h.call("daily_read", { date: "2026-10-08" });
      if (!missing.ok) expect.unreachable();
      else expect((missing.result as { exists: boolean }).exists).toBe(false);
      expect((await h.call("daily_append", { date: "2026-10-08", content: "- [ ] one" })).ok).toBe(true);
      const reread = await h.call("daily_read", { date: "2026-10-08" });
      if (!reread.ok) expect.unreachable();
      else {
        expect((reread.result as { exists: boolean }).exists).toBe(true);
        expect((reread.result as { content: string }).content).toMatch(/- \[ \] one/);
      }
      expect((await h.call("daily_append", { date: "2026-10-08", content: "- [ ] two" })).ok).toBe(true);
      const both = await h.call("daily_read", { date: "2026-10-08" });
      if (!both.ok) expect.unreachable();
      else expect((both.result as { content: string }).content).toMatch(/- \[ \] one[\s\S]*- \[ \] two/);
    } finally {
      h.cleanup();
    }
  });

  it("workspace get reveals nothing without a grant", async () => {
    const h = harness();
    try {
      const root = mkdtempSync(join(tmpdir(), "takenotes-mcphost-"));
      const workspaces = new WorkspaceService();
      const notes = new NoteService(workspaces, {
        native: new NativeFileAdapter(async () => {}),
        wslRequest: async () => {
          throw new Error("no wsl in tests");
        },
      });
      const ports = createMcpPorts({ workspaces, notes });
      const denied = await dispatchMcpTool(
        { ports, grants: emptyGrantStore(), log: h.log },
        "claude",
        "workspace_get",
        { workspaceId: h.reg.id },
      );
      if (denied.ok) expect.unreachable();
      else expect(denied.error.code).toBe("PERMISSION_DENIED");
      expect(h.log.entries.at(-1)).toMatchObject({ ok: false, errorCode: "PERMISSION_DENIED" });
      rmSync(root, { recursive: true, force: true });
    } finally {
      h.cleanup();
    }
  });
});
