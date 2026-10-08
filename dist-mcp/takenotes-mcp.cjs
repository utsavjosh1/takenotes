#!/usr/bin/env node
"use strict";

// tools/mcp-sidecar/src/index.ts
var import_node_net = require("node:net");
var import_node_crypto = require("node:crypto");

// packages/contracts/src/protocol.ts
function encodeFrame(payload) {
  const json = JSON.stringify(payload);
  const body = Buffer.from(json, "utf8");
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32BE(body.length, 0);
  return Buffer.concat([header, body]);
}
var FrameDecoder = class {
  constructor(maxFrameBytes) {
    this.maxFrameBytes = maxFrameBytes;
  }
  maxFrameBytes;
  buffer = Buffer.alloc(0);
  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const frames = [];
    for (; ; ) {
      if (this.buffer.length < 4) return { frames };
      const length = this.buffer.readUInt32BE(0);
      if (length === 0) {
        return { frames, error: "zero-length frame" };
      }
      if (length > this.maxFrameBytes) {
        return { frames, error: `frame too large: ${length}` };
      }
      if (this.buffer.length < 4 + length) return { frames };
      const body = this.buffer.subarray(4, 4 + length);
      this.buffer = this.buffer.subarray(4 + length);
      try {
        frames.push(JSON.parse(body.toString("utf8")));
      } catch {
        return { frames, error: "invalid JSON in frame" };
      }
    }
  }
};

// packages/contracts/src/protocol-version.ts
var MAX_FRAME_BYTES = 16 * 1024 * 1024;

// packages/core/src/mcp/transport.ts
var import_node_os = require("node:os");
var import_node_path = require("node:path");
var MCP_PIPE_NAME = "takenotes-mcp";
function mcpSocketPath(platform = process.platform, envRuntimeDir = process.env.XDG_RUNTIME_DIR, tmp = (0, import_node_os.tmpdir)(), uid = typeof process.getuid === "function" ? String(process.getuid()) : "app") {
  if (platform === "win32") return `\\\\.\\pipe\\${MCP_PIPE_NAME}`;
  const runtime = envRuntimeDir?.trim() ?? "";
  const dir = runtime.startsWith("/") ? runtime : tmp;
  return (0, import_node_path.join)(dir, `${MCP_PIPE_NAME}-${uid}.sock`);
}
var MCP_APP_NOT_RUNNING = "TAKENOTES_APP_NOT_RUNNING";

// packages/core/src/mcp/tools.ts
var MCP_V1_TOOLS = [
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
  "daily_append"
];
var MCP_TOOL_PARAMS = {
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
  daily_append: { required: ["workspaceId", "date", "content"] }
};
function isMcpTool(name) {
  return MCP_V1_TOOLS.includes(name);
}
function s(description) {
  return { type: "string", description };
}
var MCP_TOOL_SCHEMAS = {
  workspace_list: {
    description: "Workspaces this client may access (granted only). No params.",
    properties: {}
  },
  workspace_get: {
    description: "One granted workspace by id.",
    properties: { workspaceId: s("Opaque workspace id from workspace_list.") }
  },
  note_list: {
    description: "Markdown note paths in the workspace, sorted (capped).",
    properties: { workspaceId: s("Opaque workspace id.") }
  },
  note_read: {
    description: "Note content plus revision hash (needed for note_update).",
    properties: {
      workspaceId: s("Opaque workspace id."),
      path: s("Workspace-relative .md path.")
    }
  },
  note_create: {
    description: "Create a note. Fails ALREADY_EXISTS when the path is taken.",
    properties: {
      workspaceId: s("Opaque workspace id."),
      path: s("Workspace-relative .md path."),
      content: s("Full file content.")
    }
  },
  note_update: {
    description: "Rewrite a note. Stale expectedRevision fails CONFLICT \u2014 read again.",
    properties: {
      workspaceId: s("Opaque workspace id."),
      path: s("Workspace-relative .md path."),
      content: s("Full replacement content."),
      expectedRevision: s("Revision hash from the latest note_read.")
    }
  },
  search_notes: {
    description: "Search grammar over the workspace (one match per file, 50 max).",
    properties: {
      workspaceId: s("Opaque workspace id."),
      query: s('Words AND by default; "phrase", OR, -negation, tag:, file:, [prop:value].')
    }
  },
  task_list: {
    description: "All Markdown tasks. Ids are path#L<line> pinned at list time.",
    properties: { workspaceId: s("Opaque workspace id.") }
  },
  task_create: {
    description: "Append a task (defaults to Inbox.md).",
    properties: {
      workspaceId: s("Opaque workspace id."),
      description: s("Task text; @due(...) / @scheduled(...) tokens allowed."),
      path: s("Optional target note (default Inbox.md)."),
      due: s("Optional deadline YYYY-MM-DD."),
      scheduled: s("Optional time-block YYYY-MM-DD.")
    }
  },
  task_update: {
    description: "Edit description and/or completed. Moved lines fail \u2014 re-list.",
    properties: {
      workspaceId: s("Opaque workspace id."),
      taskId: s("Task id from task_list."),
      description: s("New text (trailing @-tokens preserved)."),
      completed: { type: "boolean", description: "Check or uncheck." }
    }
  },
  task_complete: {
    description: "Check a task (same as update with completed:true).",
    properties: {
      workspaceId: s("Opaque workspace id."),
      taskId: s("Task id from task_list.")
    }
  },
  calendar_events: {
    description: "Event notes (type:event with start). Optional ISO range narrows.",
    properties: {
      workspaceId: s("Opaque workspace id."),
      start: s("Optional range start (ISO)."),
      end: s("Optional range end (ISO).")
    }
  },
  calendar_create: {
    description: "Create an event note under Events/ (or given path).",
    properties: {
      workspaceId: s("Opaque workspace id."),
      start: s("ISO-8601 start with offset."),
      end: s("Optional ISO-8601 end."),
      title: s("Optional title (default Untitled event)."),
      path: s("Optional note path.")
    }
  },
  calendar_update: {
    description: "Patch title/start/end of an event note (id is its path).",
    properties: {
      workspaceId: s("Opaque workspace id."),
      eventId: s("Event note path."),
      title: s("New title."),
      start: s("New ISO-8601 start."),
      end: s("New ISO-8601 end.")
    }
  },
  daily_read: {
    description: "Read a Daily Note. Missing dates report exists:false (never created silently).",
    properties: {
      workspaceId: s("Opaque workspace id."),
      date: s("YYYY-MM-DD.")
    }
  },
  daily_append: {
    description: "Append to a Daily Note, creating it with its header when missing.",
    properties: {
      workspaceId: s("Opaque workspace id."),
      date: s("YYYY-MM-DD."),
      content: s("Markdown to append.")
    }
  }
};

// tools/mcp-sidecar/src/session.ts
var MCP_PROTOCOL_VERSION = "2024-11-05";
var MCP_SERVER_NAME = "takenotes-mcp";
var MCP_SERVER_VERSION = "0.0.9";
function createMcpSession(roundTrip) {
  let initialized = false;
  let clientId = "unknown-client";
  const ok = (id, result) => ({
    jsonrpc: "2.0",
    id: id ?? null,
    result
  });
  const err = (id, code, message, data) => ({
    jsonrpc: "2.0",
    id: id ?? null,
    error: data === void 0 ? { code, message } : { code, message, data }
  });
  async function handle(message) {
    if (typeof message !== "object" || message === null) {
      return err(null, -32600, "Invalid Request: expected an object.");
    }
    const { id, method, params } = message;
    if (typeof method !== "string") {
      return err(typeof id === "string" || typeof id === "number" ? id : null, -32600, "Invalid Request: missing method.");
    }
    const replyId = id === void 0 ? void 0 : id;
    const noReply = replyId === void 0 ? true : false;
    switch (method) {
      case "initialize": {
        const name = typeof params === "object" && params !== null ? params.clientInfo?.name : void 0;
        if (typeof name === "string" && name.trim()) clientId = name.trim().slice(0, 256);
        initialized = true;
        const result = {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION }
        };
        return noReply ? null : ok(replyId, result);
      }
      case "notifications/initialized":
        return null;
      case "ping":
        return noReply ? null : ok(replyId, {});
      case "tools/list": {
        if (!initialized) return noReply ? null : err(replyId, -32002, "Server not initialized.");
        return noReply ? null : ok(replyId, {
          tools: MCP_V1_TOOLS.map((name) => ({
            name,
            description: MCP_TOOL_SCHEMAS[name].description,
            inputSchema: {
              type: "object",
              properties: Object.fromEntries(
                Object.entries(MCP_TOOL_SCHEMAS[name].properties).map(([key, schema]) => [
                  key,
                  { type: schema.type, description: schema.description }
                ])
              ),
              required: [...MCP_TOOL_PARAMS[name].required]
            }
          }))
        });
      }
      case "tools/call": {
        if (!initialized) return noReply ? null : err(replyId, -32002, "Server not initialized.");
        if (noReply) return null;
        const args = typeof params === "object" && params !== null ? params : {};
        if (typeof args.name !== "string" || !isMcpTool(args.name)) {
          return err(replyId, -32602, `Unknown tool "${String(args.name ?? "")}".`);
        }
        let response;
        try {
          response = await roundTrip(
            args.name,
            typeof args.arguments === "object" && args.arguments !== null ? args.arguments : {},
            clientId
          );
        } catch {
          return err(replyId, -32001, `App is not running (${MCP_APP_NOT_RUNNING}): open takenotes first.`);
        }
        if (!response.ok) {
          return ok(replyId, {
            content: [{ type: "text", text: `${response.error.code}: ${response.error.message}` }],
            isError: true
          });
        }
        return ok(replyId, { content: [{ type: "text", text: JSON.stringify(response.result) }] });
      }
      default:
        return noReply ? null : err(replyId, -32601, `Method not found: ${method}.`);
    }
  }
  return {
    get clientId() {
      return clientId;
    },
    handle
  };
}
function createLineSplitter(onLine, onParseError) {
  let buffer = "";
  return {
    push(chunk) {
      buffer += chunk;
      for (; ; ) {
        const nl = buffer.indexOf("\n");
        if (nl < 0) {
          if (buffer.length > 16 * 1024 * 1024) {
            buffer = "";
            onParseError();
          }
          return;
        }
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          JSON.parse(line);
        } catch {
          onParseError();
          continue;
        }
        onLine(line);
      }
    }
  };
}

// tools/mcp-sidecar/src/index.ts
var socketPath = mcpSocketPath();
function dial(tool, params, clientId) {
  return new Promise((resolve, reject) => {
    const decoder = new FrameDecoder(MAX_FRAME_BYTES);
    const requestId = (0, import_node_crypto.randomUUID)();
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    let socket;
    try {
      socket = (0, import_node_net.connect)(socketPath);
    } catch (err) {
      fail(err);
      return;
    }
    const timer = setTimeout(() => {
      fail(new Error(MCP_APP_NOT_RUNNING));
      socket.destroy();
    }, 5e3);
    timer.unref?.();
    socket.once("connect", () => {
      socket.write(encodeFrame({ requestId, clientId, tool, params }));
    });
    socket.on("data", (chunk) => {
      const { frames, error } = decoder.push(chunk);
      if (error) {
        clearTimeout(timer);
        fail(new Error(error));
        socket.destroy();
        return;
      }
      for (const frame of frames) {
        const response = frame;
        if (typeof response !== "object" || response === null || response.requestId !== requestId) {
          continue;
        }
        if (settled) continue;
        settled = true;
        clearTimeout(timer);
        socket.end();
        resolve(response);
        return;
      }
    });
    socket.once("error", (err) => {
      clearTimeout(timer);
      fail(err);
    });
    socket.once("close", () => {
      clearTimeout(timer);
      fail(new Error(MCP_APP_NOT_RUNNING));
    });
  });
}
var session = createMcpSession(dial);
var splitter = createLineSplitter(
  (line) => {
    void (async () => {
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        return;
      }
      const reply = await session.handle(parsed);
      if (reply) process.stdout.write(`${JSON.stringify(reply)}
`);
    })();
  },
  () => {
    process.stdout.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error." } })}
`
    );
  }
);
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => splitter.push(chunk));
process.stdin.on("end", () => process.exit(0));
process.stdin.resume();
