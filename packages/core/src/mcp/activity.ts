/** Step 8 MCP activity log (Phase 5a): append-only, bounded, pure + total.
 *
 * ADR-0009/0012: every MCP tool call lands in an append-only activity
 * log in app-data (never in workspaces). This module holds the
 * in-memory model: ordered entries with sequence numbers, a hard cap
 * (oldest drop first — the log is audit aid, not backup), and
 * string serialization the caller persists. No filesystem, no clock:
 * the caller supplies timestamps so tests pin time.
 */

export type McpActivityEntry = {
  /** Monotonic per-log sequence (1-based). Survives serialize round-trip. */
  seq: number;
  /** Millis epoch supplied by the caller. */
  at: number;
  clientId: string;
  tool: string;
  workspaceId?: string;
  ok: boolean;
  /** AppError code when `ok` is false (never raw secrets). */
  errorCode?: string;
};

/** Hard cap: the log degrades to recent history, never unbounded growth. */
export const MAX_MCP_ACTIVITY_ENTRIES = 1000;

export type McpActivityLog = {
  entries: McpActivityEntry[];
  nextSeq: number;
};

export function emptyActivityLog(): McpActivityLog {
  return { entries: [], nextSeq: 1 };
}

export type McpActivityInput = {
  at: number;
  clientId: string;
  tool: string;
  workspaceId?: string;
  ok: boolean;
  errorCode?: string;
};

/** Append one entry. Missing/blank `clientId`/`tool` or non-finite `at`
 * refuses (returns null, no mutation) — the log never holds
 * unattributable rows. Caps at `MAX_MCP_ACTIVITY_ENTRIES`. */
export function appendActivity(
  log: McpActivityLog,
  input: McpActivityInput,
): McpActivityEntry | null {
  if (!Number.isFinite(input.at)) return null;
  const clientId = input.clientId?.trim() ?? "";
  const tool = input.tool?.trim() ?? "";
  if (!clientId || !tool) return null;
  const entry: McpActivityEntry = {
    seq: log.nextSeq,
    at: input.at,
    clientId,
    tool,
    ok: input.ok,
  };
  const workspaceId = input.workspaceId?.trim() ?? "";
  if (workspaceId) entry.workspaceId = workspaceId;
  const errorCode = input.errorCode?.trim() ?? "";
  if (!input.ok && errorCode) entry.errorCode = errorCode;
  log.entries.push(entry);
  log.nextSeq += 1;
  while (log.entries.length > MAX_MCP_ACTIVITY_ENTRIES) {
    log.entries.shift();
  }
  return entry;
}

/** Serialize for app-data persistence. The caller owns the file. */
export function serializeActivity(log: McpActivityLog): string {
  return JSON.stringify({ version: 1, nextSeq: log.nextSeq, entries: log.entries });
}

/** Parse persisted activity. Unparseable input yields an empty log —
 * never throws. Malformed entries drop individually; `nextSeq`
 * re-derives to max(seq)+1 when the stored value is unusable. */
export function parseActivity(input: unknown): McpActivityLog {
  const empty = emptyActivityLog();
  if (typeof input !== "string") return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return empty;
  }
  if (typeof parsed !== "object" || parsed === null) return empty;
  const record = parsed as { entries?: unknown; nextSeq?: unknown };
  if (!Array.isArray(record.entries)) return empty;
  let maxSeq = 0;
  for (const item of record.entries) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
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
      continue;
    }
    const entry: McpActivityEntry = {
      seq: r.seq,
      at: r.at,
      clientId: r.clientId,
      tool: r.tool,
      ok: r.ok,
    };
    if (typeof r.workspaceId === "string" && r.workspaceId.trim()) {
      entry.workspaceId = r.workspaceId;
    }
    if (!r.ok && typeof r.errorCode === "string" && r.errorCode.trim()) {
      entry.errorCode = r.errorCode;
    }
    if (empty.entries.some((e) => e.seq === entry.seq)) continue;
    empty.entries.push(entry);
    if (entry.seq > maxSeq) maxSeq = entry.seq;
  }
  empty.entries.sort((a, b) => a.seq - b.seq);
  empty.nextSeq =
    typeof record.nextSeq === "number" &&
    Number.isInteger(record.nextSeq) &&
    record.nextSeq > maxSeq
      ? record.nextSeq
      : maxSeq + 1;
  return empty;
}
