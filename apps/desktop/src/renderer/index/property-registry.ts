import { parsePropertyRegistry, type PropertyRegistry } from "@takenotes/core/index/properties";

/** Step 3b property-type registry (renderer side, no UI yet).
 *
 * Logical file: app-data `property-types.json`
 * (`{ [workspaceId]: { [propertyName]: type } }`). Persisted in
 * `localStorage` (`takenotes.propTypes`) with the identical shape so a
 * later move to a main-side file is a straight copy — same pattern as the
 * Step 2 hotkey store. Storage is injected (vitest runs in node without
 * `localStorage`); production passes the default.
 */

const STORAGE_KEY = "takenotes.propTypes";

export type RegistryStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function defaultStorage(): RegistryStorage | undefined {
  try {
    const ls = (globalThis as { localStorage?: RegistryStorage }).localStorage;
    return ls ?? undefined;
  } catch {
    return undefined;
  }
}

function readAll(storage: RegistryStorage | undefined): Record<string, PropertyRegistry> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, PropertyRegistry> = {};
    for (const [workspaceId, registry] of Object.entries(parsed as Record<string, unknown>)) {
      out[workspaceId] = parsePropertyRegistry(registry);
    }
    return out;
  } catch {
    return {};
  }
}

/** Load one workspace's registry (defaults apply at interpretation time;
 * unknown workspaces yield `{}`). Never throws. */
export function loadPropertyRegistry(storage: RegistryStorage | undefined, workspaceId: string): PropertyRegistry {
  return readAll(storage ?? defaultStorage())[workspaceId] ?? {};
}

/** Persist one workspace's registry; other workspaces untouched. Best
 * effort (storage full/blocked keeps values in memory for the session). */
export function savePropertyRegistry(
  storage: RegistryStorage | undefined,
  workspaceId: string,
  registry: PropertyRegistry,
): void {
  const target = storage ?? defaultStorage();
  if (!target) return;
  const all = readAll(target);
  all[workspaceId] = parsePropertyRegistry(registry);
  try {
    target.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* storage full/blocked — values stay in memory */
  }
}
