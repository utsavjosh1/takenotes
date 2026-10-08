/** Step 8 MCP grants (Phase 5a): per-client × per-workspace, pure + total.
 *
 * ADR-0009/0012: every MCP call is authorized against a grant matrix —
 * a client holds access to explicit workspaces only, never wildcards,
 * never raw paths. `workspace_list` reveals only granted workspaces.
 * Approval-screen UI lands in Phase 5c; persistence in app-data
 * (never in workspaces) is the caller's job via `serializeGrants` /
 * `parseGrants` — this module holds the in-memory model only.
 *
 * No filesystem, no IPC: identical inputs grant identical access.
 */

export type McpGrant = {
  /** MCP client identity (e.g. `claude-code`, `codex`). */
  clientId: string;
  /** Opaque workspace id (ADR-0007) — never a raw path. */
  workspaceId: string;
  /** Millis epoch when approved (audit + activity-log correlation). */
  grantedAt: number;
};

export type McpGrantStore = {
  grants: McpGrant[];
};

export function emptyGrantStore(): McpGrantStore {
  return { grants: [] };
}

function cleanId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 && trimmed.length <= 256 ? trimmed : null;
}

/** Approve `clientId` for `workspaceId`. Idempotent: re-approving
 * refreshes `grantedAt`. Returns false (no mutation) on bad ids. */
export function grantAccess(
  store: McpGrantStore,
  clientId: unknown,
  workspaceId: unknown,
  now: number = Date.now(),
): boolean {
  const client = cleanId(clientId);
  const workspace = cleanId(workspaceId);
  if (!client || !workspace || !Number.isFinite(now)) return false;
  const existing = store.grants.find((g) => g.clientId === client && g.workspaceId === workspace);
  if (existing) {
    existing.grantedAt = now;
    return true;
  }
  store.grants.push({ clientId: client, workspaceId: workspace, grantedAt: now });
  return true;
}

/** Revoke one client × workspace grant. True when something was removed. */
export function revokeAccess(
  store: McpGrantStore,
  clientId: unknown,
  workspaceId: unknown,
): boolean {
  const client = cleanId(clientId);
  const workspace = cleanId(workspaceId);
  if (!client || !workspace) return false;
  const before = store.grants.length;
  store.grants = store.grants.filter(
    (g) => !(g.clientId === client && g.workspaceId === workspace),
  );
  return store.grants.length < before;
}

/** Revoke every grant for a client (client offboarded). */
export function revokeClient(store: McpGrantStore, clientId: unknown): boolean {
  const client = cleanId(clientId);
  if (!client) return false;
  const before = store.grants.length;
  store.grants = store.grants.filter((g) => g.clientId !== client);
  return store.grants.length < before;
}

/** Drop every grant touching a workspace (workspace closed/removed). */
export function revokeWorkspace(store: McpGrantStore, workspaceId: unknown): boolean {
  const workspace = cleanId(workspaceId);
  if (!workspace) return false;
  const before = store.grants.length;
  store.grants = store.grants.filter((g) => g.workspaceId !== workspace);
  return store.grants.length < before;
}

/** True when `clientId` may act on `workspaceId`. Bad ids deny. */
export function hasAccess(
  store: McpGrantStore,
  clientId: unknown,
  workspaceId: unknown,
): boolean {
  const client = cleanId(clientId);
  const workspace = cleanId(workspaceId);
  if (!client || !workspace) return false;
  return store.grants.some((g) => g.clientId === client && g.workspaceId === workspace);
}

/** Workspace ids visible to `clientId` (the `workspace_list` boundary).
 * Sorted for deterministic output. */
export function grantedWorkspaces(store: McpGrantStore, clientId: unknown): string[] {
  const client = cleanId(clientId);
  if (!client) return [];
  return store.grants
    .filter((g) => g.clientId === client)
    .map((g) => g.workspaceId)
    .sort();
}

/** Serialize for app-data persistence. The caller owns the file. */
export function serializeGrants(store: McpGrantStore): string {
  return JSON.stringify({ version: 1, grants: store.grants });
}

/** Parse persisted grants. Unparseable input yields an empty store —
 * fail closed (deny), never fail open, never throw. Entries with bad
 * ids or non-numeric timestamps drop individually. */
export function parseGrants(input: unknown): McpGrantStore {
  const empty = emptyGrantStore();
  if (typeof input !== "string") return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return empty;
  }
  if (typeof parsed !== "object" || parsed === null) return empty;
  const list = (parsed as { grants?: unknown }).grants;
  if (!Array.isArray(list)) return empty;
  for (const item of list) {
    if (typeof item !== "object" || item === null) continue;
    const { clientId, workspaceId, grantedAt } = item as Record<string, unknown>;
    const client = cleanId(clientId);
    const workspace = cleanId(workspaceId);
    if (!client || !workspace || typeof grantedAt !== "number" || !Number.isFinite(grantedAt)) {
      continue;
    }
    if (!hasAccess(empty, client, workspace)) {
      empty.grants.push({ clientId: client, workspaceId: workspace, grantedAt });
    }
  }
  return empty;
}
