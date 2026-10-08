/** Step 8 MCP tool catalog (Phase 5a): V1 allowlist, pure + total.
 *
 * ADR-0009/0012: MCP is server-only over stdio. The `takenotes-mcp`
 * sidecar (Phase 5c) speaks framed 4-byte BE length + UTF-8 JSON with a
 * 16 MiB cap — that framing already lives in
 * `@takenotes/contracts/protocol` (`encodeFrame`/`FrameDecoder`,
 * `MAX_FRAME_BYTES`) and is reused as-is, never reimplemented here.
 *
 * This module owns the *catalog*: which tools exist in V1, their
 * parameter shapes, and the deferred list (honest rejection, not
 * silent absence). Dispatch against services lands in Phase 5b; the
 * catalog never touches the filesystem, services, or IPC.
 *
 * V1 tools (ADR-0012): `workspace_list/get`, `note_list/read/create/
 * update`, `search_notes`, `task_list/create/update/complete`,
 * `calendar_events/create/update`, `daily_read/append`. Deferred:
 * `note_delete`, `command_execute`, properties/backlinks/collections/
 * templates/plugins/shell/raw-fs, remote/headless operation.
 */

export const MCP_V1_TOOLS = [
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
] as const;

export type McpToolName = (typeof MCP_V1_TOOLS)[number];

/** Tools clients ask for that are explicitly out of V1 scope. The
 * dispatcher rejects these with `INVALID_REQUEST` naming the tool —
 * never with a generic "unknown tool", so callers learn the boundary. */
export const MCP_DEFERRED_TOOLS = [
  "note_delete",
  "command_execute",
  "properties_get",
  "properties_set",
  "backlinks_get",
  "collections_query",
  "templates_render",
] as const;

export type McpDeferredToolName = (typeof MCP_DEFERRED_TOOLS)[number];

/** Required string params per V1 tool. Shapes stay minimal on purpose:
 * `workspaceId` scopes every workspace-bound call (ADR-0009 — no raw
 * paths by default); `expectedRevision` carries the CONFLICT contract
 * on mutation. Full JSON Schemas for MCP clients are a Phase 5b
 * concern, built from this table. */
export const MCP_TOOL_PARAMS: Record<McpToolName, { required: readonly string[] }> = {
  workspace_list: { required: [] },
  workspace_get: { required: ["workspaceId"] },
  note_list: { required: ["workspaceId"] },
  note_read: { required: ["workspaceId", "path"] },
  note_create: { required: ["workspaceId", "path", "content"] },
  note_update: { required: ["workspaceId", "path", "content", "expectedRevision"] },
  search_notes: { required: ["workspaceId", "query"] },
  task_list: { required: ["workspaceId"] },
  task_create: { required: ["workspaceId", "description"] },
  task_update: { required: ["workspaceId", "taskId"] },
  task_complete: { required: ["workspaceId", "taskId"] },
  calendar_events: { required: ["workspaceId"] },
  calendar_create: { required: ["workspaceId", "start"] },
  calendar_update: { required: ["workspaceId", "eventId"] },
  daily_read: { required: ["workspaceId", "date"] },
  daily_append: { required: ["workspaceId", "date", "content"] },
};

/** True for V1 allowlisted tools. Anything else is rejected — unknown
 * names as "unknown tool", deferred names via `isDeferredMcpTool`. */
export function isMcpTool(name: string): name is McpToolName {
  return (MCP_V1_TOOLS as readonly string[]).includes(name);
}

/** True for tools explicitly deferred from V1 (rejected with a
 * boundary message, not an unknown-tool error). */
export function isDeferredMcpTool(name: string): name is McpDeferredToolName {
  return (MCP_DEFERRED_TOOLS as readonly string[]).includes(name);
}

export type McpParamSchema = {
  type: "string" | "boolean";
  description: string;
};

export type McpToolSchema = {
  description: string;
  properties: Record<string, McpParamSchema>;
};

function s(description: string): McpParamSchema {
  return { type: "string", description };
}

/** JSON-Schema inputs for MCP `tools/list`, derived from the same
 * allowlist. `properties` covers every param dispatch understands
 * (required + optional); `required` stays the V1 contract from
 * `MCP_TOOL_PARAMS`. Descriptions name the V1 boundaries (caps,
 * `path#L<line>` task ids, YYYY-MM-DD dailies) so agents learn them
 * before calling. */
export const MCP_TOOL_SCHEMAS: Record<McpToolName, McpToolSchema> = {
  workspace_list: {
    description: "Workspaces this client may access (granted only). No params.",
    properties: {},
  },
  workspace_get: {
    description: "One granted workspace by id.",
    properties: { workspaceId: s("Opaque workspace id from workspace_list.") },
  },
  note_list: {
    description: "Markdown note paths in the workspace, sorted (capped).",
    properties: { workspaceId: s("Opaque workspace id.") },
  },
  note_read: {
    description: "Note content plus revision hash (needed for note_update).",
    properties: {
      workspaceId: s("Opaque workspace id."),
      path: s("Workspace-relative .md path."),
    },
  },
  note_create: {
    description: "Create a note. Fails ALREADY_EXISTS when the path is taken.",
    properties: {
      workspaceId: s("Opaque workspace id."),
      path: s("Workspace-relative .md path."),
      content: s("Full file content."),
    },
  },
  note_update: {
    description: "Rewrite a note. Stale expectedRevision fails CONFLICT — read again.",
    properties: {
      workspaceId: s("Opaque workspace id."),
      path: s("Workspace-relative .md path."),
      content: s("Full replacement content."),
      expectedRevision: s("Revision hash from the latest note_read."),
    },
  },
  search_notes: {
    description: "Search grammar over the workspace (one match per file, 50 max).",
    properties: {
      workspaceId: s("Opaque workspace id."),
      query: s("Words AND by default; \"phrase\", OR, -negation, tag:, file:, [prop:value]."),
    },
  },
  task_list: {
    description: "All Markdown tasks. Ids are path#L<line> pinned at list time.",
    properties: { workspaceId: s("Opaque workspace id.") },
  },
  task_create: {
    description: "Append a task (defaults to Inbox.md).",
    properties: {
      workspaceId: s("Opaque workspace id."),
      description: s("Task text; @due(...) / @scheduled(...) tokens allowed."),
      path: s("Optional target note (default Inbox.md)."),
      due: s("Optional deadline YYYY-MM-DD."),
      scheduled: s("Optional time-block YYYY-MM-DD."),
    },
  },
  task_update: {
    description: "Edit description and/or completed. Moved lines fail — re-list.",
    properties: {
      workspaceId: s("Opaque workspace id."),
      taskId: s("Task id from task_list."),
      description: s("New text (trailing @-tokens preserved)."),
      completed: { type: "boolean", description: "Check or uncheck." },
    },
  },
  task_complete: {
    description: "Check a task (same as update with completed:true).",
    properties: {
      workspaceId: s("Opaque workspace id."),
      taskId: s("Task id from task_list."),
    },
  },
  calendar_events: {
    description: "Event notes (type:event with start). Optional ISO range narrows.",
    properties: {
      workspaceId: s("Opaque workspace id."),
      start: s("Optional range start (ISO)."),
      end: s("Optional range end (ISO)."),
    },
  },
  calendar_create: {
    description: "Create an event note under Events/ (or given path).",
    properties: {
      workspaceId: s("Opaque workspace id."),
      start: s("ISO-8601 start with offset."),
      end: s("Optional ISO-8601 end."),
      title: s("Optional title (default Untitled event)."),
      path: s("Optional note path."),
    },
  },
  calendar_update: {
    description: "Patch title/start/end of an event note (id is its path).",
    properties: {
      workspaceId: s("Opaque workspace id."),
      eventId: s("Event note path."),
      title: s("New title."),
      start: s("New ISO-8601 start."),
      end: s("New ISO-8601 end."),
    },
  },
  daily_read: {
    description: "Read a Daily Note. Missing dates report exists:false (never created silently).",
    properties: {
      workspaceId: s("Opaque workspace id."),
      date: s("YYYY-MM-DD."),
    },
  },
  daily_append: {
    description: "Append to a Daily Note, creating it with its header when missing.",
    properties: {
      workspaceId: s("Opaque workspace id."),
      date: s("YYYY-MM-DD."),
      content: s("Markdown to append."),
    },
  },
};

/** Missing required params for a V1 tool call. Returns null for
 * unknown tools (the dispatcher owns that error). Never throws. */
export function missingMcpParams(tool: string, params: unknown): readonly string[] | null {
  if (!isMcpTool(tool)) return null;
  if (typeof params !== "object" || params === null) return [...MCP_TOOL_PARAMS[tool].required];
  const record = params as Record<string, unknown>;
  return MCP_TOOL_PARAMS[tool].required.filter((key) => record[key] === undefined);
}
