import { describe, expect, it } from "vitest";
import {
  appendActivity,
  emptyActivityLog,
  MAX_MCP_ACTIVITY_ENTRIES,
  parseActivity,
  serializeActivity,
} from "@takenotes/core/mcp/activity";
import {
  emptyGrantStore,
  grantAccess,
  grantedWorkspaces,
  hasAccess,
  parseGrants,
  revokeAccess,
  revokeClient,
  revokeWorkspace,
  serializeGrants,
} from "@takenotes/core/mcp/grants";
import {
  isDeferredMcpTool,
  isMcpTool,
  MCP_DEFERRED_TOOLS,
  MCP_TOOL_PARAMS,
  MCP_V1_TOOLS,
  missingMcpParams,
} from "@takenotes/core/mcp/tools";

describe("mcp tool catalog", () => {
  it("covers the ADR-0012 V1 set (16 tools)", () => {
    expect(MCP_V1_TOOLS).toHaveLength(16);
    for (const name of [
      "workspace_list",
      "workspace_get",
      "note_list",
      "note_read",
      "note_create",
      "note_update",
      "search_notes",
      "task_list",
      "task_create",
      "task_update",
      "task_complete",
      "calendar_events",
      "calendar_create",
      "calendar_update",
      "daily_read",
      "daily_append",
    ] as const) {
      expect(isMcpTool(name)).toBe(true);
    }
  });

  it("rejects deferred tools as non-V1 with a boundary signal", () => {
    expect(isMcpTool("note_delete")).toBe(false);
    expect(isMcpTool("command_execute")).toBe(false);
    expect(isDeferredMcpTool("note_delete")).toBe(true);
    expect(isDeferredMcpTool("command_execute")).toBe(true);
    expect(MCP_DEFERRED_TOOLS.length).toBeGreaterThan(0);
  });

  it("rejects unknown tools as neither V1 nor deferred", () => {
    expect(isMcpTool("drop_table")).toBe(false);
    expect(isDeferredMcpTool("drop_table")).toBe(false);
  });

  it("every V1 tool scopes by workspace except the list boundary", () => {
    for (const tool of MCP_V1_TOOLS) {
      const required = MCP_TOOL_PARAMS[tool].required;
      if (tool === "workspace_list") {
        expect(required).toEqual([]);
      } else {
        expect(required).toContain("workspaceId");
      }
    }
  });

  it("reports missing required params without throwing", () => {
    expect(missingMcpParams("note_read", { workspaceId: "w" })).toEqual(["path"]);
    expect(missingMcpParams("note_update", { workspaceId: "w" })).toEqual([
      "path",
      "content",
      "expectedRevision",
    ]);
    expect(missingMcpParams("workspace_list", {})).toEqual([]);
    expect(missingMcpParams("workspace_list", null)).toEqual([]);
    expect(missingMcpParams("note_delete", {})).toBeNull();
    expect(missingMcpParams("nope", {})).toBeNull();
  });
});

describe("mcp grants", () => {
  it("grant → access; revoke → deny", () => {
    const store = emptyGrantStore();
    expect(hasAccess(store, "claude", "w1")).toBe(false);
    expect(grantAccess(store, "claude", "w1", 1000)).toBe(true);
    expect(hasAccess(store, "claude", "w1")).toBe(true);
    expect(revokeAccess(store, "claude", "w1")).toBe(true);
    expect(hasAccess(store, "claude", "w1")).toBe(false);
    expect(revokeAccess(store, "claude", "w1")).toBe(false);
  });

  it("isolates clients and workspaces", () => {
    const store = emptyGrantStore();
    grantAccess(store, "claude", "w1", 1);
    expect(hasAccess(store, "codex", "w1")).toBe(false);
    expect(hasAccess(store, "claude", "w2")).toBe(false);
    grantAccess(store, "claude", "w2", 2);
    expect(grantedWorkspaces(store, "claude")).toEqual(["w1", "w2"]);
    expect(grantedWorkspaces(store, "codex")).toEqual([]);
  });

  it("re-grant refreshes the timestamp without duplicating", () => {
    const store = emptyGrantStore();
    grantAccess(store, "c", "w", 5);
    grantAccess(store, "c", "w", 9);
    expect(store.grants).toHaveLength(1);
    expect(store.grants[0]?.grantedAt).toBe(9);
  });

  it("revokeClient and revokeWorkspace clear their slices", () => {
    const store = emptyGrantStore();
    grantAccess(store, "a", "w1", 1);
    grantAccess(store, "a", "w2", 1);
    grantAccess(store, "b", "w1", 1);
    expect(revokeClient(store, "a")).toBe(true);
    expect(hasAccess(store, "a", "w1")).toBe(false);
    expect(hasAccess(store, "b", "w1")).toBe(true);
    expect(revokeWorkspace(store, "w1")).toBe(true);
    expect(hasAccess(store, "b", "w1")).toBe(false);
    expect(revokeClient(store, "ghost")).toBe(false);
  });

  it("rejects blank ids and never throws", () => {
    const store = emptyGrantStore();
    expect(grantAccess(store, "", "w", 1)).toBe(false);
    expect(grantAccess(store, "c", "  ", 1)).toBe(false);
    expect(grantAccess(store, null, "w", 1)).toBe(false);
    expect(hasAccess(store, "", "w")).toBe(false);
    expect(store.grants).toHaveLength(0);
  });

  it("serialize round-trips; corrupt input fails closed to empty", () => {
    const store = emptyGrantStore();
    grantAccess(store, "c", "w1", 7);
    const back = parseGrants(serializeGrants(store));
    expect(hasAccess(back, "c", "w1")).toBe(true);
    expect(parseGrants("not json{").grants).toEqual([]);
    expect(parseGrants(null).grants).toEqual([]);
    expect(parseGrants('{"grants":[{"clientId":"","workspaceId":"w"}]}').grants).toEqual([]);
  });
});

describe("mcp activity log", () => {
  it("appends ordered entries with sequence numbers", () => {
    const log = emptyActivityLog();
    const a = appendActivity(log, { at: 10, clientId: "c", tool: "note_read", ok: true });
    const b = appendActivity(log, {
      at: 11,
      clientId: "c",
      tool: "note_update",
      workspaceId: "w1",
      ok: false,
      errorCode: "CONFLICT",
    });
    expect(a?.seq).toBe(1);
    expect(b?.seq).toBe(2);
    expect(b?.errorCode).toBe("CONFLICT");
    expect(log.entries).toHaveLength(2);
  });

  it("refuses unattributable rows without mutating", () => {
    const log = emptyActivityLog();
    expect(appendActivity(log, { at: 1, clientId: " ", tool: "note_read", ok: true })).toBeNull();
    expect(appendActivity(log, { at: 1, clientId: "c", tool: "", ok: true })).toBeNull();
    expect(
      appendActivity(log, { at: Number.NaN, clientId: "c", tool: "note_read", ok: true }),
    ).toBeNull();
    expect(log.entries).toHaveLength(0);
  });

  it("caps at 1000 entries, oldest drop first", () => {
    const log = emptyActivityLog();
    for (let i = 0; i < MAX_MCP_ACTIVITY_ENTRIES + 5; i++) {
      appendActivity(log, { at: i, clientId: "c", tool: "search_notes", ok: true });
    }
    expect(log.entries).toHaveLength(MAX_MCP_ACTIVITY_ENTRIES);
    expect(log.entries[0]?.seq).toBe(6);
    expect(log.nextSeq).toBe(MAX_MCP_ACTIVITY_ENTRIES + 6);
  });

  it("serialize round-trips; corrupt input yields an empty log", () => {
    const log = emptyActivityLog();
    appendActivity(log, { at: 3, clientId: "c", tool: "daily_append", workspaceId: "w", ok: true });
    const back = parseActivity(serializeActivity(log));
    expect(back.entries).toHaveLength(1);
    expect(back.entries[0]?.tool).toBe("daily_append");
    expect(back.nextSeq).toBe(2);
    expect(parseActivity("garbage").entries).toEqual([]);
    expect(parseActivity(null).entries).toEqual([]);
  });
});
