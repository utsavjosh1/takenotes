/** Step 8 MCP host (Phase 5c): `McpPorts` over the service layer.
 *
 * ADR-0009: automation goes through the same services as the UI — this
 * adapter delegates notes/workspace reads to `NoteService` /
 * `WorkspaceService` and derives search/tasks/calendar/daily from the
 * same core parsers the renderer index uses (`parseDocument`,
 * search grammar, calendar collectors). No raw paths cross the
 * boundary: every method takes a `workspaceId` the dispatcher has
 * already grant-checked, and unknown ids surface as errors, never as
 * filesystem access.
 *
 * On-demand parsing (no renderer index dependency): each index-backed
 * call walks the tree, reads Markdown files, and parses them fresh.
 * Bounded — at most `MAX_MCP_SCAN_FILES` files per call, `>1 MiB`
 * files skipped by `WorkspaceIndex.upsert` — so a hostile workspace
 * degrades to bounded work. Freshness beats caching here: MCP reads
 * always see current bytes (revision guards still apply on write).
 */
import { appError, type AppError } from "@takenotes/contracts/errors";
import type { FileRevision } from "@takenotes/contracts/ipc";
import { WorkspaceIndex } from "@takenotes/core/index/store";
import { parseSearchQuery, type SearchQuery } from "@takenotes/core/search/query";
import { searchContent, searchFilenames } from "@takenotes/core/search/search";
import {
  assertDailyDate,
  dailyNoteContent,
  dailyNotePath,
} from "@takenotes/core/productivity/daily";
import {
  collectCalendarRange,
  eventEndOf,
  eventStartOf,
} from "@takenotes/core/productivity/calendar";
import type {
  McpCalendarEvent,
  McpPorts,
  McpSearchMatch,
  McpTask,
  McpWorkspaceSummary,
} from "@takenotes/core/mcp/dispatch";
import type { NoteService } from "./note-service.js";
import type { WorkspaceService } from "./workspace-service.js";
import type { WorkspaceRegistration } from "../workspace/registry.js";

/** Files parsed per index-backed call (mirrors the index bulk cap). */
export const MAX_MCP_SCAN_FILES = 2000;
/** Matches returned per `search_notes` call (one per file, filename hits first). */
export const MAX_MCP_SEARCH_RESULTS = 50;

export type McpHostDeps = {
  workspaces: WorkspaceService;
  notes: NoteService;
};

const TASK_LINE_RE = /^(\s*[-*+]\s*\[)([ xX])(\]\s*)(.*)$/;
const TRAILING_TOKENS_RE = /((?:\s+@(?:due|scheduled|priority)\([^)]*\))*)\s*$/;

function summaryOf(reg: WorkspaceRegistration): McpWorkspaceSummary {
  return { id: reg.id, displayName: reg.displayName, kind: reg.type };
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

/** Task identity is `path#L<1-based line>` pinned at list time. Lines
 * shift as files edit, so mutations re-verify the line is still a task
 * line and fail `INVALID_REQUEST` (moved — re-list) otherwise. */
function parseTaskId(taskId: string): { path: string; line: number } | null {
  const hash = taskId.lastIndexOf("#L");
  if (hash < 0) return null;
  const line = Number(taskId.slice(hash + 2));
  const path = taskId.slice(0, hash);
  if (!path || !Number.isInteger(line) || line < 1) return null;
  return { path, line };
}

export function createMcpPorts(deps: McpHostDeps): McpPorts {
  const { workspaces, notes } = deps;

  async function markdownPaths(workspaceId: string): Promise<{ paths: string[] } | { error: AppError }> {
    const paths: string[] = [];
    const queue = [""];
    while (queue.length > 0) {
      const dir = queue.shift()!;
      const listed = await notes.listTree(workspaceId, dir);
      if ("error" in listed) return listed;
      for (const entry of listed.entries) {
        if (entry.kind === "directory") {
          queue.push(entry.relativePath);
        } else if (/\.md$/i.test(entry.relativePath)) {
          paths.push(entry.relativePath);
          if (paths.length >= MAX_MCP_SCAN_FILES) return { paths };
        }
      }
    }
    return { paths };
  }

  async function buildIndex(
    workspaceId: string,
  ): Promise<{ index: WorkspaceIndex } | { error: AppError }> {
    const listed = await markdownPaths(workspaceId);
    if ("error" in listed) return listed;
    const index = new WorkspaceIndex();
    for (const path of listed.paths) {
      const read = await notes.readFile(workspaceId, path);
      if ("error" in read) continue;
      index.upsert(workspaceId, path, read.result.content, read.result.revision);
    }
    return { index };
  }

  function searchQuery(raw: string): { query: SearchQuery } | { error: AppError } {
    const parsed = parseSearchQuery(raw);
    if (!parsed.ok) {
      return {
        error: appError(
          "INVALID_REQUEST",
          `Unsupported search operator "${parsed.error.operator}".`,
          parsed.error.operator,
        ),
      };
    }
    return { query: parsed.query };
  }

  async function readLines(
    workspaceId: string,
    path: string,
  ): Promise<{ lines: string[]; revision: FileRevision; newline: "lf" | "crlf"; bom: boolean } | { error: AppError }> {
    const read = await notes.readFile(workspaceId, path);
    if ("error" in read) return read;
    return {
      lines: read.result.content.split("\n"),
      revision: read.result.revision,
      newline: read.result.newlineStyle,
      bom: read.result.hadBom,
    };
  }

  return {
    async listWorkspaces() {
      return workspaces.list().map(summaryOf);
    },

    async getWorkspace(id) {
      const reg = workspaces.get(id);
      return reg ? summaryOf(reg) : null;
    },

    async listNotes(workspaceId) {
      const listed = await markdownPaths(workspaceId);
      if ("error" in listed) return listed;
      return { result: { paths: listed.paths.sort() } };
    },

    async readNote(workspaceId, path) {
      const read = await notes.readFile(workspaceId, path);
      if ("error" in read) return read;
      return { result: { content: read.result.content, revision: read.result.revision } };
    },

    async createNote(workspaceId, path, content) {
      const created = await notes.createFile(workspaceId, path, content);
      if ("error" in created) return created;
      return { result: { revision: created.revision } };
    },

    async updateNote(workspaceId, path, content, expectedRevision) {
      // Newline style + BOM ride along from the read so MCP writes never
      // re-encode the file (same parity the UI save path keeps).
      const current = await notes.readFile(workspaceId, path);
      if ("error" in current) return current;
      if (current.result.revision.hash !== expectedRevision) {
        return { error: appError("CONFLICT", "The file changed on disk. Read again before writing.") };
      }
      const written = await notes.writeFile(
        workspaceId,
        path,
        content,
        expectedRevision,
        current.result.newlineStyle,
        current.result.hadBom,
      );
      if ("error" in written) return written;
      return { result: { revision: written.revision } };
    },

    async searchNotes(workspaceId, query) {
      const parsed = searchQuery(query);
      if ("error" in parsed) return parsed;
      const built = await buildIndex(workspaceId);
      if ("error" in built) return built;
      const names = searchFilenames(built.index, workspaceId, parsed.query, MAX_MCP_SEARCH_RESULTS);
      const bodies = searchContent(
        built.index,
        workspaceId,
        parsed.query,
        MAX_MCP_SEARCH_RESULTS,
      );
      const seen = new Set<string>();
      const matches: McpSearchMatch[] = [];
      for (const match of [...names, ...bodies]) {
        if (seen.has(match.relativePath) || matches.length >= MAX_MCP_SEARCH_RESULTS) continue;
        seen.add(match.relativePath);
        matches.push({ path: match.relativePath, line: match.line, preview: match.preview });
      }
      return { result: { matches } };
    },

    async listTasks(workspaceId) {
      const built = await buildIndex(workspaceId);
      if ("error" in built) return built;
      const tasks: McpTask[] = [];
      for (const entry of built.index.list(workspaceId)) {
        for (const task of entry.tasks) {
          tasks.push({
            id: `${entry.relativePath}#L${task.line}`,
            description: task.description,
            completed: task.completed,
            path: entry.relativePath,
            line: task.line,
            ...(task.due ? { due: task.due } : {}),
            ...(task.scheduled ? { scheduled: task.scheduled } : {}),
          });
        }
      }
      return { result: { tasks } };
    },

    async createTask(workspaceId, input) {
      const target = input.path ?? "Inbox.md";
      const line = `- [ ] ${input.description}`;
      const existing = await notes.readFile(workspaceId, target);
      if ("error" in existing) {
        if (existing.error.code !== "NOT_FOUND") return existing;
        const created = await notes.createFile(workspaceId, target, `${line}\n`);
        if ("error" in created) return created;
        return { result: { task: { id: `${target}#L1`, description: input.description, completed: false, path: target, line: 1 } } };
      }
      const base = existing.result.content.endsWith("\n") || existing.result.content === ""
        ? existing.result.content
        : `${existing.result.content}\n`;
      const nextLine = base.split("\n").length;
      const written = await notes.writeFile(
        workspaceId,
        target,
        `${base}${line}\n`,
        existing.result.revision.hash,
        existing.result.newlineStyle,
        existing.result.hadBom,
      );
      if ("error" in written) return written;
      return {
        result: {
          task: { id: `${target}#L${nextLine}`, description: input.description, completed: false, path: target, line: nextLine },
        },
      };
    },

    async updateTask(workspaceId, taskId, patch) {
      return applyTaskEdit(workspaceId, taskId, patch, false);
    },

    async completeTask(workspaceId, taskId) {
      return applyTaskEdit(workspaceId, taskId, {}, true);
    },

    async listEvents(workspaceId, range) {
      const built = await buildIndex(workspaceId);
      if ("error" in built) return built;
      // Wide collector window; the explicit range narrows by ISO start
      // comparison (event starts normalize to YYYY-MM-DD[THH:MM[:SS]]).
      const days = collectCalendarRange(built.index.list(workspaceId), "1970-01-01", "2100-12-31");
      const events: McpCalendarEvent[] = [];
      for (const day of days) {
        for (const item of day.events) {
          const start = item.start;
          if (range.start && start < range.start) continue;
          if (range.end && start > range.end) continue;
          events.push({
            id: item.relativePath,
            path: item.relativePath,
            title: item.title,
            start,
            ...(item.end ? { end: item.end } : {}),
          });
        }
      }
      return { result: { events } };
    },

    async createEvent(workspaceId, input) {
      const title = input.title ?? "Untitled event";
      const safe = title.replace(/[\\/:*?"<>|#]/g, "").trim().slice(0, 80) || "Untitled event";
      const path = input.path ?? `Events/${safe}.md`;
      const fm = [
        "---",
        "type: event",
        `title: ${yamlString(title)}`,
        `start: ${yamlString(input.start)}`,
        ...(input.end ? [`end: ${yamlString(input.end)}`] : []),
        "---",
        "",
        `# ${title}`,
        "",
      ].join("\n");
      const created = await notes.createFile(workspaceId, path, fm);
      if ("error" in created) return created;
      return {
        result: {
          event: { id: path, path, title, start: input.start, ...(input.end ? { end: input.end } : {}) },
        },
      };
    },

    async updateEvent(workspaceId, eventId, patch) {
      const allowed = ["title", "start", "end"] as const;
      const clean: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(patch)) {
        if (!(allowed as readonly string[]).includes(key)) {
          return { error: appError("INVALID_REQUEST", `Cannot update event field "${key}" (title/start/end only).`) };
        }
        if (typeof value !== "string" || !value.trim()) {
          return { error: appError("INVALID_REQUEST", `Event field "${key}" must be a non-empty string.`) };
        }
        clean[key] = value;
      }
      const current = await notes.readFile(workspaceId, eventId);
      if ("error" in current) return current;
      const patched = await notes.updateProperties(workspaceId, eventId, clean, current.result.revision.hash);
      if ("error" in patched) return patched;
      const reread = await notes.readFile(workspaceId, eventId);
      if ("error" in reread) return reread;
      const built = new WorkspaceIndex();
      const entry = built.upsert(workspaceId, eventId, reread.result.content, reread.result.revision);
      const start = entry ? eventStartOf(entry) : null;
      if (!start) return { error: appError("INVALID_REQUEST", "Not an event note (missing start).") };
      return {
        result: {
          event: {
            id: eventId,
            path: eventId,
            title: entry?.title,
            start,
            ...(eventEndOf(entry!) ? { end: eventEndOf(entry!) } : {}),
          },
        },
      };
    },

    async readDaily(workspaceId, date) {
      const parts = assertDailyDate(date);
      if (!parts) return { error: appError("INVALID_REQUEST", 'Param "date" must be YYYY-MM-DD.') };
      const path = dailyNotePath(parts);
      const read = await notes.readFile(workspaceId, path);
      if ("error" in read) {
        if (read.error.code === "NOT_FOUND") return { result: { path, exists: false } };
        return read;
      }
      return { result: { path, exists: true, content: read.result.content } };
    },

    async appendDaily(workspaceId, date, content) {
      const parts = assertDailyDate(date);
      if (!parts) return { error: appError("INVALID_REQUEST", 'Param "date" must be YYYY-MM-DD.') };
      const path = dailyNotePath(parts);
      const read = await notes.readFile(workspaceId, path);
      if ("error" in read) {
        if (read.error.code !== "NOT_FOUND") return read;
        const reg = workspaces.get(workspaceId);
        const header = dailyNoteContent({ date, workspaceName: reg?.displayName ?? "Notes" });
        const created = await notes.createFile(workspaceId, path, `${header}\n${content}\n`);
        if ("error" in created) return created;
        return { result: { path } };
      }
      const base = read.result.content.endsWith("\n") || read.result.content === ""
        ? read.result.content
        : `${read.result.content}\n`;
      const written = await notes.writeFile(
        workspaceId,
        path,
        `${base}${content}\n`,
        read.result.revision.hash,
        read.result.newlineStyle,
        read.result.hadBom,
      );
      if ("error" in written) return written;
      return { result: { path } };
    },
  };

  async function applyTaskEdit(
    workspaceId: string,
    taskId: string,
    patch: Record<string, unknown>,
    complete: boolean,
  ): Promise<{ result: { task: McpTask } } | { error: AppError }> {
    const parsed = parseTaskId(taskId);
    if (!parsed) return { error: appError("INVALID_REQUEST", "Malformed task id (path#L<line>). Re-list tasks.") };
    let description: string | undefined;
    let completed: boolean | undefined = complete ? true : undefined;
    for (const [key, value] of Object.entries(patch)) {
      if (key === "description") {
        if (typeof value !== "string" || !value.trim()) {
          return { error: appError("INVALID_REQUEST", 'Task "description" must be non-empty.') };
        }
        description = value;
      } else if (key === "completed") {
        if (typeof value !== "boolean") {
          return { error: appError("INVALID_REQUEST", 'Task "completed" must be a boolean.') };
        }
        completed = value;
      } else {
        return { error: appError("INVALID_REQUEST", `Cannot update task field "${key}" (description/completed only).`) };
      }
    }
    const current = await readLines(workspaceId, parsed.path);
    if ("error" in current) return current;
    const raw = current.lines[parsed.line - 1];
    const match = TASK_LINE_RE.exec(raw ?? "");
    if (!match) {
      return { error: appError("INVALID_REQUEST", "Task moved (line is no longer a task). Re-list tasks.") };
    }
    const done = completed ?? match[2]!.toLowerCase() === "x";
    let rest = match[4]!;
    if (description !== undefined) {
      const tokens = TRAILING_TOKENS_RE.exec(rest)?.[1] ?? "";
      rest = `${description}${tokens}`;
    }
    current.lines[parsed.line - 1] = `${match[1]}${done ? "x" : " "}${match[3]}${rest}`;
    const built = new WorkspaceIndex();
    const joined = current.lines.join("\n");
    const written = await notes.writeFile(
      workspaceId,
      parsed.path,
      joined,
      current.revision.hash,
      current.newline,
      current.bom,
    );
    if ("error" in written) return written;
    const entry = built.upsert(workspaceId, parsed.path, joined, written.revision);
    const refound = entry?.tasks.find((t) => t.line === parsed.line);
    return {
      result: {
        task: {
          id: taskId,
          description: refound?.description ?? description ?? match[4]!,
          completed: done,
          path: parsed.path,
          line: parsed.line,
          ...(refound?.due ? { due: refound.due } : {}),
          ...(refound?.scheduled ? { scheduled: refound.scheduled } : {}),
        },
      },
    };
  }
}
