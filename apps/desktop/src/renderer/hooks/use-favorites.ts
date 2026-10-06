/**
 * Step 2 Favorites hook (renderer).
 * IO through the existing file boundary (`file.read/create/write`) against
 * `.takenotes/favorites.yaml`; writes carry expectedRevision (CONFLICT keeps
 * both versions safe — local doc retained, error surfaced).
 */
import { useCallback, useEffect, useState } from "react";
import type { WorkspaceInfo } from "@takenotes/contracts/ipc";
import {
  FAVORITES_REL,
  addEntry as addEntryPure,
  addGroup as addGroupPure,
  deleteGroup as deleteGroupPure,
  emptyFavoritesDoc,
  moveEntry as moveEntryPure,
  parseFavoritesDoc,
  removeEntry as removeEntryPure,
  renameGroup as renameGroupPure,
  serializeFavoritesDoc,
  setEntryAlias as setEntryAliasPure,
  type FavoriteEntry,
  type FavoritesDoc,
} from "@takenotes/core/favorites/store";
import { getBridge } from "../bridge";
import type { Notify } from "./use-notify";

export type FavoritesApi = {
  doc: FavoritesDoc;
  loading: boolean;
  loadError: string | null;
  dirty: boolean;
  reload: () => Promise<void>;
  addEntry: (group: string, entry: FavoriteEntry) => Promise<void>;
  removeEntry: (group: string, index: number) => Promise<void>;
  moveEntry: (group: string, from: number, to: number) => Promise<void>;
  setAlias: (group: string, index: number, alias: string | null) => Promise<void>;
  addGroup: (name: string) => Promise<void>;
  renameGroup: (oldName: string, newName: string) => Promise<void>;
  deleteGroup: (name: string) => Promise<void>;
};

export function useFavorites(workspace: WorkspaceInfo | null, notify: Notify): FavoritesApi {
  const { toast, errToast } = notify;
  const [doc, setDoc] = useState<FavoritesDoc>(emptyFavoritesDoc);
  const [revisionHash, setRevisionHash] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const reload = useCallback(async () => {
    if (!workspace) {
      setDoc(emptyFavoritesDoc());
      setRevisionHash(null);
      setExists(false);
      setLoadError(null);
      setDirty(false);
      return;
    }
    setLoading(true);
    const bridge = getBridge();
    if (!bridge) {
      setLoading(false);
      setLoadError("Desktop bridge unavailable.");
      return;
    }
    const res = await bridge.file.read(workspace.workspaceId, FAVORITES_REL);
    setLoading(false);
    if (!res.ok) {
      // Missing file = empty doc (created on first mutation), not an error.
      if (res.error.code === "NOT_FOUND" || /not found/i.test(res.error.message)) {
        setDoc(emptyFavoritesDoc());
        setRevisionHash(null);
        setExists(false);
        setLoadError(null);
        setDirty(false);
        return;
      }
      setLoadError(res.error.message);
      return;
    }
    const { doc: parsed, errors } = parseFavoritesDoc(res.result.content);
    setDoc(parsed);
    setRevisionHash(res.result.revision.hash);
    setExists(true);
    setLoadError(null);
    setDirty(false);
    if (errors.length > 0) toast(`Favorites: ${errors[0]}`);
  }, [workspace, toast]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const persist = useCallback(
    async (next: FavoritesDoc) => {
      if (!workspace) return;
      setDoc(next);
      setDirty(true);
      const bridge = getBridge();
      if (!bridge) {
        errToast({ code: "INTERNAL_ERROR", message: "Desktop bridge unavailable." });
        return;
      }
      const content = serializeFavoritesDoc(next);
      if (!exists || !revisionHash) {
        // Tolerant create: another client may have created it first.
        const created = await bridge.file.create(workspace.workspaceId, FAVORITES_REL);
        if (created.ok) {
          const written = await bridge.file.write({
            workspaceId: workspace.workspaceId,
            relativePath: FAVORITES_REL,
            content,
            expectedHash: created.result.hash,
            newlineStyle: "lf",
            hadBom: false,
          });
          if (written.ok) {
            setRevisionHash(written.result.hash);
            setExists(true);
            setDirty(false);
            return;
          }
          errToast(written.error);
          return;
        }
        if (created.error.code !== "ALREADY_EXISTS") {
          errToast(created.error);
          return;
        }
        // Created elsewhere since we loaded: adopt it instead of
        // overwriting blindly.
        toast("Favorites changed elsewhere — reloading to merge.");
        await reload();
        return;
      }
      // Write against the loaded baseline so CONFLICT can actually fire —
      // re-reading the revision here would make every write self-consistent
      // and silently discard external changes.
      const written = await bridge.file.write({
        workspaceId: workspace.workspaceId,
        relativePath: FAVORITES_REL,
        content,
        expectedHash: revisionHash,
        newlineStyle: "lf",
        hadBom: false,
      });
      if (!written.ok) {
        // CONFLICT: keep the local doc and the old baseline (both versions
        // safe) — the next save re-conflicts instead of overwriting.
        if (written.error.code === "CONFLICT") {
          toast("Favorites changed elsewhere — your list is kept; reload to merge.");
        } else errToast(written.error);
        return;
      }
      setRevisionHash(written.result.hash);
      setExists(true);
      setDirty(false);
    },
    [workspace, exists, revisionHash, errToast, toast, reload],
  );

  return {
    doc,
    loading,
    loadError,
    dirty,
    reload,
    addEntry: useCallback((group: string, entry: FavoriteEntry) => persist(addEntryPure(doc, group, entry)), [doc, persist]),
    removeEntry: useCallback((group: string, index: number) => persist(removeEntryPure(doc, group, index)), [doc, persist]),
    moveEntry: useCallback((group: string, from: number, to: number) => persist(moveEntryPure(doc, group, from, to)), [doc, persist]),
    setAlias: useCallback((group: string, index: number, alias: string | null) => persist(setEntryAliasPure(doc, group, index, alias)), [doc, persist]),
    addGroup: useCallback((name: string) => persist(addGroupPure(doc, name)), [doc, persist]),
    renameGroup: useCallback((oldName: string, newName: string) => persist(renameGroupPure(doc, oldName, newName)), [doc, persist]),
    deleteGroup: useCallback((name: string) => persist(deleteGroupPure(doc, name)), [doc, persist]),
  };
}
