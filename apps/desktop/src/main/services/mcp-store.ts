/** Step 8 MCP store (Phase 5c): grants + activity persistence in app-data.
 *
 * ADR-0009/0012: grants and the append-only activity log live in
 * app-data, never in workspaces — deleting them loses no notes.
 * The caller supplies the directory (production: app-data; tests: a
 * tmp dir). All functions fail closed and never throw: unreadable or
 * corrupt files yield empty models, and failed writes report
 * `false` (the in-memory model stays authoritative for the session).
 */
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  emptyActivityLog,
  type McpActivityEntry,
  type McpActivityLog,
  MAX_MCP_ACTIVITY_ENTRIES,
} from "@takenotes/core/mcp/activity";
import {
  emptyGrantStore,
  parseGrants,
  serializeGrants,
  type McpGrantStore,
} from "@takenotes/core/mcp/grants";

const GRANTS_FILE = "mcp-grants.json";
const ACTIVITY_FILE = "mcp-activity.jsonl";
/** Compact the JSONL file past this size (keeps the last full window). */
const ACTIVITY_COMPACT_BYTES = 512 * 1024;

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

async function writeAtomic(path: string, content: string): Promise<boolean> {
  try {
    await mkdir(join(path, ".."), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, content, "utf8");
    await rename(tmp, path);
    return true;
  } catch {
    return false;
  }
}

export async function loadMcpGrants(dir: string): Promise<McpGrantStore> {
  const text = await readText(join(dir, GRANTS_FILE));
  if (text === null) return emptyGrantStore();
  return parseGrants(text);
}

export async function saveMcpGrants(dir: string, store: McpGrantStore): Promise<boolean> {
  return writeAtomic(join(dir, GRANTS_FILE), serializeGrants(store));
}

function parseActivityLine(line: string): McpActivityEntry | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const r = parsed as Record<string, unknown>;
  if (
    typeof r.seq !== "number" ||
    !Number.isInteger(r.seq) ||
    r.seq < 1 ||
    typeof r.at !== "number" ||
    !Number.isFinite(r.at) ||
    typeof r.clientId !== "string" ||
    !r.clientId.trim() ||
    typeof r.tool !== "string" ||
    !r.tool.trim() ||
    typeof r.ok !== "boolean"
  ) {
    return null;
  }
  const entry: McpActivityEntry = { seq: r.seq, at: r.at, clientId: r.clientId, tool: r.tool, ok: r.ok };
  if (typeof r.workspaceId === "string" && r.workspaceId.trim()) entry.workspaceId = r.workspaceId;
  if (!r.ok && typeof r.errorCode === "string" && r.errorCode.trim()) entry.errorCode = r.errorCode;
  return entry;
}

/** Load the persisted activity tail (at most the last full window).
 * Corrupt lines drop individually; a missing file yields an empty log. */
export async function loadMcpActivity(dir: string): Promise<McpActivityLog> {
  const log = emptyActivityLog();
  const text = await readText(join(dir, ACTIVITY_FILE));
  if (text === null) return log;
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const tail = lines.slice(-MAX_MCP_ACTIVITY_ENTRIES);
  let maxSeq = 0;
  for (const line of tail) {
    const entry = parseActivityLine(line);
    if (!entry || log.entries.some((e) => e.seq === entry.seq)) continue;
    log.entries.push(entry);
    if (entry.seq > maxSeq) maxSeq = entry.seq;
  }
  log.entries.sort((a, b) => a.seq - b.seq);
  log.nextSeq = maxSeq + 1;
  return log;
}

/** Append entries to the JSONL file, compacting past the size cap.
 * Returns false (log kept in memory only) when the disk write fails. */
export async function appendMcpActivity(dir: string, entries: McpActivityEntry[]): Promise<boolean> {
  if (entries.length === 0) return true;
  const path = join(dir, ACTIVITY_FILE);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(path, `${entries.map((e) => JSON.stringify(e)).join("\n")}\n`, {
      encoding: "utf8",
      flag: "a",
    });
  } catch {
    return false;
  }
  try {
    const info = await stat(path);
    if (info.size > ACTIVITY_COMPACT_BYTES) {
      const fresh = await loadMcpActivity(dir);
      await writeAtomic(path, `${fresh.entries.map((e) => JSON.stringify(e)).join("\n")}\n`);
    }
  } catch {
    // Compaction is best-effort; the append already landed.
  }
  return true;
}
