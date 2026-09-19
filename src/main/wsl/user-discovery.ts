import { appError, type AppError } from "../../shared/errors.js";
import type { WslLinuxUser } from "../../shared/contracts/ipc.js";
import { isValidDistroId } from "./launch-security.js";

export type UserDiscoverySession = {
  request: (operation: string, payload: Record<string, unknown>) => Promise<unknown>;
  dispose: () => void;
};

export type UserDiscoveryDeps = {
  /** Ephemeral helper session inside the selected distro (default user, no
   * workspace opened). Only the explicitly selected distro is ever entered —
   * listing never spawns. Wired in main; injected in tests. */
  spawnSession: (distro: string) => Promise<UserDiscoverySession>;
};

type WireUser = {
  name: string;
  uid: number;
  gid?: number;
  home: string;
  shell?: string;
  isCurrent?: boolean;
};

function isWireUser(v: unknown): v is WireUser {
  if (!v || typeof v !== "object") return false;
  const u = v as Record<string, unknown>;
  return (
    typeof u["name"] === "string" &&
    (u["name"] as string).length >= 1 &&
    (u["name"] as string).length <= 64 &&
    typeof u["uid"] === "number" &&
    Number.isSafeInteger(u["uid"]) &&
    typeof u["home"] === "string" &&
    (u["home"] as string).length >= 1 &&
    (u["gid"] === undefined || (typeof u["gid"] === "number" && Number.isSafeInteger(u["gid"]))) &&
    (u["shell"] === undefined || typeof u["shell"] === "string") &&
    (u["isCurrent"] === undefined || typeof u["isCurrent"] === "boolean")
  );
}

/** Validate the helper payload and project wire names onto the renderer
 * contract (`name` → `username`, `isCurrent` → `isDefault`). A malformed
 * payload is INTERNAL_ERROR — distinct from a valid empty list, which is a
 * real answer (no interactive users) and resolves to []. */
function checkedUsers(res: unknown): WslLinuxUser[] {
  if (!res || typeof res !== "object" || !Array.isArray((res as { users?: unknown }).users)) {
    throw appError("INTERNAL_ERROR", "User discovery returned an unusable response.");
  }
  const wire = (res as { users: unknown[] }).users;
  const out: WslLinuxUser[] = [];
  for (const w of wire) {
    if (!isWireUser(w)) {
      throw appError("INTERNAL_ERROR", "User discovery returned an unusable response.");
    }
    out.push({
      username: w.name,
      uid: w.uid,
      ...(w.gid === undefined ? {} : { gid: w.gid }),
      home: w.home,
      ...(w.shell === undefined ? {} : { shell: w.shell }),
      ...(w.isCurrent === undefined ? {} : { isDefault: w.isCurrent }),
    });
  }
  return out;
}

function detailOf(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return undefined;
}

/** Discover interactive Linux users for one explicitly selected distro.
 * Throws INVALID_REQUEST for unknown distro ids (nothing is spawned),
 * DISCONNECTED when the distro cannot be entered, and preserves structured
 * helper errors otherwise. Never touches unrelated distros. */
export async function listWslUsers(distro: unknown, deps: UserDiscoveryDeps): Promise<WslLinuxUser[]> {
  if (!isValidDistroId(distro)) {
    throw appError("INVALID_REQUEST", "Unknown distribution.");
  }
  let session: UserDiscoverySession;
  try {
    session = await deps.spawnSession(distro);
  } catch (err) {
    throw appError("DISCONNECTED", "Could not query Linux users.", detailOf(err));
  }
  try {
    return checkedUsers(await session.request("users.list", {}));
  } catch (err) {
    if (err && typeof err === "object" && typeof (err as { code?: unknown }).code === "string") {
      const e = err as AppError;
      throw e.detail === undefined
        ? { code: e.code, message: e.message }
        : { code: e.code, message: e.message, detail: e.detail };
    }
    throw appError("INTERNAL_ERROR", "Could not query Linux users.", detailOf(err));
  } finally {
    try {
      session.dispose();
    } catch {
      /* already gone */
    }
  }
}
