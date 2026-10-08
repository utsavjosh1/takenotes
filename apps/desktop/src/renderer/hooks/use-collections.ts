/**
 * Step 6 Collections hook (renderer).
 * IO through the existing file boundary against
 * `.takenotes/collections/*.yaml`; writes carry expectedHash (CONFLICT
 * keeps both versions safe — local doc retained, error surfaced).
 * A missing directory means no collections yet, not an error.
 */
import { useCallback, useEffect, useState } from "react";
import type { WorkspaceInfo } from "@takenotes/contracts/ipc";
import {
  COLLECTIONS_DIR,
  addCollectionView as addViewPure,
  collectionFileName,
  emptyCollectionDoc,
  parseCollectionDoc,
  removeCollectionView as removeViewPure,
  renameCollectionView as renameViewPure,
  serializeCollectionDoc,
  type CollectionDoc,
  type CollectionView,
} from "@takenotes/core/collections/store";
import { getBridge } from "../bridge";
import type { Notify } from "./use-notify";

export type CollectionFile = {
  /** Workspace-relative path of the definition file. */
  file: string;
  doc: CollectionDoc;
  revisionHash: string | null;
};

export type CollectionsApi = {
  files: CollectionFile[];
  loading: boolean;
  loadError: string | null;
  saving: boolean;
  reload: () => Promise<void>;
  createCollection: (name: string) => Promise<void>;
  deleteCollection: (file: string) => Promise<void>;
  saveDoc: (file: string, doc: CollectionDoc) => Promise<void>;
  addView: (file: string, view: CollectionView) => Promise<void>;
  removeView: (file: string, viewName: string) => Promise<void>;
  renameView: (file: string, oldName: string, newName: string) => Promise<void>;
};

function stemOf(file: string): string {
  const base = file.slice(file.lastIndexOf("/") + 1);
  return base.endsWith(".yaml") ? base.slice(0, -5) : base;
}

export function useCollections(workspace: WorkspaceInfo | null, notify: Notify): CollectionsApi {
  const { toast, errToast } = notify;
  const [files, setFiles] = useState<CollectionFile[]>([]);
  const [hashes, setHashes] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!workspace) {
      setFiles([]);
      setHashes({});
      setLoadError(null);
      return;
    }
    setLoading(true);
    const bridge = getBridge();
    if (!bridge) {
      setLoading(false);
      setLoadError("Desktop bridge unavailable.");
      return;
    }
    const list = await bridge.directory.list(workspace.workspaceId, COLLECTIONS_DIR);
    if (!list.ok) {
      setLoading(false);
      // Missing dir = no collections yet (created on first use).
      if (list.error.code === "NOT_FOUND" || /not found/i.test(list.error.message)) {
        setFiles([]);
        setHashes({});
        setLoadError(null);
        return;
      }
      setLoadError(list.error.message);
      return;
    }
    const out: CollectionFile[] = [];
    const nextHashes: Record<string, string | null> = {};
    for (const e of list.result) {
      if (e.kind !== "file" || !e.relativePath.endsWith(".yaml")) continue;
      const read = await bridge.file.read(workspace.workspaceId, e.relativePath);
      if (!read.ok) continue;
      const { doc, errors } = parseCollectionDoc(read.result.content, stemOf(e.relativePath));
      if (errors.length > 0) toast(`Collection ${stemOf(e.relativePath)}: ${errors[0]}`);
      out.push({ file: e.relativePath, doc, revisionHash: read.result.revision.hash });
      nextHashes[e.relativePath] = read.result.revision.hash;
    }
    out.sort((a, b) => (a.doc.name < b.doc.name ? -1 : 1));
    setFiles(out);
    setHashes(nextHashes);
    setLoading(false);
    setLoadError(null);
  }, [workspace, toast]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const writeFile = useCallback(
    async (file: string, doc: CollectionDoc, expectedHash: string | null, exists: boolean) => {
      const bridge = getBridge();
      if (!workspace || !bridge) {
        errToast({ code: "INTERNAL_ERROR", message: "Desktop bridge unavailable." });
        return;
      }
      setSaving(true);
      try {
        const content = serializeCollectionDoc(doc);
        if (!exists || !expectedHash) {
          const created = await bridge.file.create(workspace.workspaceId, file);
          if (!created.ok) {
            if (created.error.code === "ALREADY_EXISTS") {
              toast("Collection changed elsewhere — reloading.");
              await reload();
              return;
            }
            errToast(created.error);
            return;
          }
          const written = await bridge.file.write({
            workspaceId: workspace.workspaceId,
            relativePath: file,
            content,
            expectedHash: created.result.hash,
            newlineStyle: "lf",
            hadBom: false,
          });
          if (!written.ok) {
            errToast(written.error);
            return;
          }
          setHashes((h) => ({ ...h, [file]: written.result.hash }));
        } else {
          const written = await bridge.file.write({
            workspaceId: workspace.workspaceId,
            relativePath: file,
            content,
            expectedHash,
            newlineStyle: "lf",
            hadBom: false,
          });
          if (!written.ok) {
            errToast(written.error);
            return;
          }
          setHashes((h) => ({ ...h, [file]: written.result.hash }));
        }
        setFiles((fs) => fs.map((f) => (f.file === file ? { ...f, doc } : f)).sort((a, b) => (a.doc.name < b.doc.name ? -1 : 1)));
      } finally {
        setSaving(false);
      }
    },
    [workspace, errToast, toast, reload],
  );

  const createCollection = useCallback(
    async (name: string) => {
      if (!workspace) return;
      const stem = collectionFileName(name);
      if (!stem) {
        toast("Invalid collection name.");
        return;
      }
      const file = `${COLLECTIONS_DIR}/${stem}`;
      if (files.some((f) => f.file === file)) {
        toast("A collection with that name already exists.");
        return;
      }
      setFiles((fs) => [...fs, { file, doc: emptyCollectionDoc(name), revisionHash: null }]);
      await writeFile(file, emptyCollectionDoc(name), null, false);
    },
    [workspace, files, toast, writeFile],
  );

  const deleteCollection = useCallback(
    async (file: string) => {
      if (!workspace) return;
      const bridge = getBridge();
      if (!bridge) {
        errToast({ code: "INTERNAL_ERROR", message: "Desktop bridge unavailable." });
        return;
      }
      if (!window.confirm(`Delete collection ${stemOf(file)}? The notes stay untouched.`)) return;
      const res = await bridge.file.trash(workspace.workspaceId, file);
      if (!res.ok) {
        errToast(res.error);
        return;
      }
      setFiles((fs) => fs.filter((f) => f.file !== file));
    },
    [workspace, errToast],
  );

  const saveDoc = useCallback(
    async (file: string, doc: CollectionDoc) => {
      const known = files.find((f) => f.file === file);
      await writeFile(file, doc, hashes[file] ?? known?.revisionHash ?? null, known?.revisionHash != null || hashes[file] != null);
    },
    [files, hashes, writeFile],
  );

  const mutateViews = useCallback(
    async (file: string, fn: (doc: CollectionDoc) => CollectionDoc) => {
      const known = files.find((f) => f.file === file);
      if (!known) return;
      const next = fn(known.doc);
      if (next === known.doc) return;
      await saveDoc(file, next);
    },
    [files, saveDoc],
  );

  const addView = useCallback((file: string, view: CollectionView) => mutateViews(file, (d) => addViewPure(d, view)), [mutateViews]);
  const removeView = useCallback((file: string, viewName: string) => mutateViews(file, (d) => removeViewPure(d, viewName)), [mutateViews]);
  const renameView = useCallback(
    (file: string, oldName: string, newName: string) => mutateViews(file, (d) => renameViewPure(d, oldName, newName)),
    [mutateViews],
  );

  return { files, loading, loadError, saving, reload, createCollection, deleteCollection, saveDoc, addView, removeView, renameView };
}
