/**
 * M1 — Favorites read (thin module over core store).
 *
 * YAML round-trip, validation, and unresolved-target retention live in
 * `core/favorites/store`. This module only fetches
 * `.takenotes/favorites.yaml` through `MobileWorkspace`: missing file →
 * empty doc (never an error); invalid YAML → empty doc + errors (file
 * untouched — core guarantee).
 */

import type { AppError } from "@takenotes/contracts/errors";
import {
  FAVORITES_REL,
  emptyFavoritesDoc,
  parseFavoritesDoc,
  type FavoritesDoc,
} from "@takenotes/core/favorites/store";
import type { MobileWorkspace } from "../workspace/mobile-workspace.js";

export type { FavoritesDoc };

export async function readFavorites(
  ws: MobileWorkspace,
): Promise<{ doc: FavoritesDoc; errors: string[] } | { error: AppError }> {
  const out = await ws.read(FAVORITES_REL);
  if ("error" in out) {
    if (out.error.code === "NOT_FOUND") return { doc: emptyFavoritesDoc(), errors: [] };
    return { error: out.error };
  }
  const parsed = parseFavoritesDoc(out.result.content);
  return { doc: parsed.doc, errors: parsed.errors };
}
