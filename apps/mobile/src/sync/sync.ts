/**
 * M0 — WorkspaceSync seam (S5, hypothetical seam reserved).
 *
 * codebase-design: "One adapter means a hypothetical seam." V1 is local-only,
 * so we declare the interface now (so V1 never hard-codes local-only
 * assumptions) and ship only the no-op adapter. V2 adds `LanSyncAdapter`
 * over `apps/server` without touching callers.
 */

export type SyncStatus = { pending: number; lastSyncMs: number | null };

export interface WorkspaceSync {
  readonly kind: "local-only" | "lan";
  pull(): Promise<{ applied: number }>;
  push(): Promise<{ uploaded: number }>;
  status(): Promise<SyncStatus>;
}

/** V1 adapter: everything is already local. Pull/push are no-ops. */
export class LocalOnlySync implements WorkspaceSync {
  readonly kind = "local-only" as const;

  async pull(): Promise<{ applied: number }> {
    return { applied: 0 };
  }

  async push(): Promise<{ uploaded: number }> {
    return { uploaded: 0 };
  }

  async status(): Promise<SyncStatus> {
    return { pending: 0, lastSyncMs: null };
  }
}
