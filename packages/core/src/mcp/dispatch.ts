/** Step 8 MCP dispatch (Phase 5b): allowlist → params → grants → ports.
 *
 * Pure orchestration over the Phase 5a catalog + grants + activity
 * models. The host implements `McpPorts` (thin adapters over the
 * service layer — main in Phase 5c, fakes in tests); this module owns
 * the authorization boundary and never touches the filesystem,
 * services, or IPC directly.
 *
 * Denial semantics (fail closed, no existence leaks):
 * - unknown tool → `INVALID_REQUEST` ("unknown tool")
 * - deferred tool → `INVALID_REQUEST` naming the V1 boundary
 * - missing params → `INVALID_REQUEST` listing them
 * - blank client / no grant → `PERMISSION_DENIED` (same signal whether
 *   the workspace exists or not)
 * - port errors pass through untouched (CONFLICT, NOT_FOUND, …)
 *
 * Every attributable attempt appends one activity-log row (ok + denial
 * alike) when a log is supplied; unattributable calls (blank client)
 * are denied before logging. The result shape mirrors
 * `HelperResponse` minus `requestId` so the Phase 5c sidecar can
 * forward frames without reshaping.
 */
import { appError, type AppError } from "@takenotes/contracts/errors";
import type { FileRevision } from "@takenotes/contracts/ipc";
import { assertDailyDate } from "../productivity/daily.js";
import {
  appendActivity,
  type McpActivityLog,
} from "./activity.js";
import { grantedWorkspaces, hasAccess, type McpGrantStore } from "./grants.js";
import {
  isDeferredMcpTool,
  isMcpTool,
  missingMcpParams,
  type McpToolName,
} from "./tools.js";

export type McpWorkspaceSummary = {
  id: string;
  displayName: string;
  kind: string;
};

export type McpTask = {
  id: string;
  description: string;
  completed: boolean;
  path?: string;
  line?: number;
  due?: string;
  scheduled?: string;
};

export type McpCalendarEvent = {
  id: string;
  start: string;
  title?: string;
  path?: string;
  end?: string;
};

export type McpSearchMatch = {
  path: string;
  line?: number;
  preview?: string;
};

type PortResult<T> = Promise<{ result: T } | { error: AppError }>;

/** Host-owned service adapters. Result unions mirror the main service
 * style (`{ result } | { error }`) so Phase 5c wiring stays thin.
 * `workspaceId` values arriving here are grant-checked; ports must
 * still resolve them through the service layer (unknown → NOT_FOUND
 * or equivalent), never by raw path. */
export type McpPorts = {
  listWorkspaces(): Promise<McpWorkspaceSummary[]>;
  getWorkspace(id: string): Promise<McpWorkspaceSummary | null>;
  listNotes(workspaceId: string): PortResult<{ paths: string[] }>;
  readNote(workspaceId: string, path: string): PortResult<{ content: string; revision: FileRevision }>;
  createNote(workspaceId: string, path: string, content: string): PortResult<{ revision: FileRevision }>;
  updateNote(
    workspaceId: string,
    path: string,
    content: string,
    expectedRevision: string,
  ): PortResult<{ revision: FileRevision }>;
  searchNotes(workspaceId: string, query: string): PortResult<{ matches: McpSearchMatch[] }>;
  listTasks(workspaceId: string): PortResult<{ tasks: McpTask[] }>;
  createTask(
    workspaceId: string,
    input: { description: string; path?: string; due?: string; scheduled?: string },
  ): PortResult<{ task: McpTask }>;
  updateTask(
    workspaceId: string,
    taskId: string,
    patch: Record<string, unknown>,
  ): PortResult<{ task: McpTask }>;
  completeTask(workspaceId: string, taskId: string): PortResult<{ task: McpTask }>;
  listEvents(
    workspaceId: string,
    range: { start?: string; end?: string },
  ): PortResult<{ events: McpCalendarEvent[] }>;
  createEvent(
    workspaceId: string,
    input: { start: string; end?: string; title?: string; path?: string },
  ): PortResult<{ event: McpCalendarEvent }>;
  updateEvent(
    workspaceId: string,
    eventId: string,
    patch: Record<string, unknown>,
  ): PortResult<{ event: McpCalendarEvent }>;
  readDaily(
    workspaceId: string,
    date: string,
  ): PortResult<{ path: string; exists: boolean; content?: string }>;
  appendDaily(workspaceId: string, date: string, content: string): PortResult<{ path: string }>;
};

export type McpDispatchContext = {
  ports: McpPorts;
  grants: McpGrantStore;
  log?: McpActivityLog;
  now?: () => number;
};

export type McpDispatchResult =
  | { ok: true; result: unknown }
  | { ok: false; error: AppError };

function asRecord(params: unknown): Record<string, unknown> | null {
  return typeof params === "object" && params !== null ? (params as Record<string, unknown>) : null;
}

function strParam(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optStrParam(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function patchOf(record: Record<string, unknown>, exclude: readonly string[]): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!exclude.includes(key)) patch[key] = value;
  }
  return patch;
}

function unwrap<T>(outcome: { result: T } | { error: AppError }): McpDispatchResult {
  if ("error" in outcome) return { ok: false, error: outcome.error };
  return { ok: true, result: outcome.result };
}

export async function dispatchMcpTool(
  ctx: McpDispatchContext,
  clientId: unknown,
  tool: unknown,
  params: unknown,
): Promise<McpDispatchResult> {
  const now = ctx.now ?? Date.now;
  const client = typeof clientId === "string" ? clientId.trim() : "";
  const name = typeof tool === "string" ? tool : "";
  const record = asRecord(params) ?? {};

  const finish = (outcome: McpDispatchResult): McpDispatchResult => {
    if (ctx.log && client) {
      appendActivity(ctx.log, {
        at: now(),
        clientId: client,
        tool: name.trim() || "unknown-tool",
        workspaceId: optStrParam(record, "workspaceId"),
        ok: outcome.ok,
        errorCode: outcome.ok ? undefined : outcome.error.code,
      });
    }
    return outcome;
  };

  if (!client) {
    return finish({ ok: false, error: appError("PERMISSION_DENIED", "Unknown MCP client.") });
  }
  if (!isMcpTool(name)) {
    if (isDeferredMcpTool(name)) {
      return finish({
        ok: false,
        error: appError(
          "INVALID_REQUEST",
          `Tool "${name}" is deferred from MCP V1 (notes/search/task/calendar/daily only).`,
        ),
      });
    }
    return finish({ ok: false, error: appError("INVALID_REQUEST", `Unknown MCP tool "${name}".`) });
  }
  const missing = missingMcpParams(name, params);
  if (missing && missing.length > 0) {
    return finish({
      ok: false,
      error: appError("INVALID_REQUEST", `Tool "${name}" is missing: ${missing.join(", ")}.`, missing.join(",")),
    });
  }

  // `workspace_list` is the grant boundary itself: no workspace check,
  // and the result reveals only granted workspaces.
  if (name === "workspace_list") {
    const ids = grantedWorkspaces(ctx.grants, client);
    const summaries: McpWorkspaceSummary[] = [];
    for (const id of ids) {
      const summary = await ctx.ports.getWorkspace(id);
      if (summary) summaries.push(summary);
    }
    return finish({ ok: true, result: { workspaces: summaries } });
  }

  const workspaceId = strParam(record, "workspaceId");
  if (!workspaceId || !hasAccess(ctx.grants, client, workspaceId)) {
    return finish({ ok: false, error: appError("PERMISSION_DENIED", "No grant for this workspace.") });
  }

  return finish(await runTool(ctx.ports, name, workspaceId, record));
}

async function runTool(
  ports: McpPorts,
  name: McpToolName,
  workspaceId: string,
  record: Record<string, unknown>,
): Promise<McpDispatchResult> {
  switch (name) {
    case "workspace_list":
      return { ok: false, error: appError("INTERNAL_ERROR", "Unreachable.") };
    case "workspace_get": {
      const summary = await ports.getWorkspace(workspaceId);
      if (!summary) return { ok: false, error: appError("NOT_FOUND", "Workspace not found.") };
      return { ok: true, result: summary };
    }
    case "note_list":
      return unwrap(await ports.listNotes(workspaceId));
    case "note_read": {
      const path = strParam(record, "path");
      if (!path) return { ok: false, error: appError("INVALID_REQUEST", 'Param "path" must be non-empty.') };
      return unwrap(await ports.readNote(workspaceId, path));
    }
    case "note_create": {
      const path = strParam(record, "path");
      const content = record.content;
      if (!path) return { ok: false, error: appError("INVALID_REQUEST", 'Param "path" must be non-empty.') };
      if (typeof content !== "string") {
        return { ok: false, error: appError("INVALID_REQUEST", 'Param "content" must be a string.') };
      }
      return unwrap(await ports.createNote(workspaceId, path, content));
    }
    case "note_update": {
      const path = strParam(record, "path");
      const content = record.content;
      const expectedRevision = strParam(record, "expectedRevision");
      if (!path) return { ok: false, error: appError("INVALID_REQUEST", 'Param "path" must be non-empty.') };
      if (typeof content !== "string") {
        return { ok: false, error: appError("INVALID_REQUEST", 'Param "content" must be a string.') };
      }
      if (!expectedRevision) {
        return { ok: false, error: appError("INVALID_REQUEST", 'Param "expectedRevision" must be non-empty.') };
      }
      return unwrap(await ports.updateNote(workspaceId, path, content, expectedRevision));
    }
    case "search_notes": {
      const query = strParam(record, "query");
      if (!query) return { ok: false, error: appError("INVALID_REQUEST", 'Param "query" must be non-empty.') };
      return unwrap(await ports.searchNotes(workspaceId, query));
    }
    case "task_list":
      return unwrap(await ports.listTasks(workspaceId));
    case "task_create": {
      const description = strParam(record, "description");
      if (!description) {
        return { ok: false, error: appError("INVALID_REQUEST", 'Param "description" must be non-empty.') };
      }
      return unwrap(
        await ports.createTask(workspaceId, {
          description,
          path: optStrParam(record, "path"),
          due: optStrParam(record, "due"),
          scheduled: optStrParam(record, "scheduled"),
        }),
      );
    }
    case "task_update": {
      const taskId = strParam(record, "taskId");
      if (!taskId) return { ok: false, error: appError("INVALID_REQUEST", 'Param "taskId" must be non-empty.') };
      return unwrap(await ports.updateTask(workspaceId, taskId, patchOf(record, ["workspaceId", "taskId"])));
    }
    case "task_complete": {
      const taskId = strParam(record, "taskId");
      if (!taskId) return { ok: false, error: appError("INVALID_REQUEST", 'Param "taskId" must be non-empty.') };
      return unwrap(await ports.completeTask(workspaceId, taskId));
    }
    case "calendar_events":
      return unwrap(
        await ports.listEvents(workspaceId, {
          start: optStrParam(record, "start"),
          end: optStrParam(record, "end"),
        }),
      );
    case "calendar_create": {
      const start = strParam(record, "start");
      if (!start) return { ok: false, error: appError("INVALID_REQUEST", 'Param "start" must be non-empty.') };
      return unwrap(
        await ports.createEvent(workspaceId, {
          start,
          end: optStrParam(record, "end"),
          title: optStrParam(record, "title"),
          path: optStrParam(record, "path"),
        }),
      );
    }
    case "calendar_update": {
      const eventId = strParam(record, "eventId");
      if (!eventId) return { ok: false, error: appError("INVALID_REQUEST", 'Param "eventId" must be non-empty.') };
      return unwrap(await ports.updateEvent(workspaceId, eventId, patchOf(record, ["workspaceId", "eventId"])));
    }
    case "daily_read":
    case "daily_append": {
      const date = strParam(record, "date");
      if (!date || !assertDailyDate(date)) {
        return { ok: false, error: appError("INVALID_REQUEST", 'Param "date" must be YYYY-MM-DD.') };
      }
      if (name === "daily_read") return unwrap(await ports.readDaily(workspaceId, date));
      const content = record.content;
      if (typeof content !== "string" || !content.trim()) {
        return { ok: false, error: appError("INVALID_REQUEST", 'Param "content" must be non-empty.') };
      }
      return unwrap(await ports.appendDaily(workspaceId, date, content));
    }
  }
}
