import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RecoverySnapshotMeta, WorkspaceInfo } from "@takenotes/contracts/ipc";
import { syncFileIndex, workspaceIndex } from "../index/workspace-index";
import { fileName, joinRel, parentDir } from "../components/types";
import {
  activateDoc,
  activateTabByIndex as activateTabByIndexInLayout,
  activeDoc,
  applyRename,
  closeDocInPane,
  createLayout,
  markConflict,
  markSaved,
  markSaving,
  openDocInPane,
  paneDocs,
  popClosedTab,
  removeDocsForEntry,
  reorderTabs as reorderTabsInLayout,
  resolveDoc,
  togglePinned,
  updateDocContent,
  type PaneLayout,
} from "../panes";
import { useIndexMeta } from "../stores/index-meta";
import { useSettingsStore } from "../stores/settings";
import { getBridge } from "../bridge";
import type { Notify } from "./use-notify";
import type { RecentsApi } from "./use-recents";

export type RecoveryEntry = { content: string; updatedAt: number; stale: boolean; diskChanged: boolean };
export type HistoryDialogState = { docKey: string; loading: boolean; error: string | null; snapshots: RecoverySnapshotMeta[] };
export type Cursor = { line: number; col: number };
export type SaveView = "clean" | "conflict" | "saving" | "dirty" | "saved";

/** Draft IPC guards: the dev loop rebuilds main/preload only on restart,
 *  so a hot-reloaded renderer can run against a stale main without draft
 *  handlers (or a stale preload without the `draft` bridge). Drafts are
 *  best-effort recovery data — their absence must never break file open,
 *  save, or spam unhandled rejections. All three helpers degrade to no-op. */
async function safeDraftGet(
  workspaceId: string,
  relativePath: string,
): Promise<{ content: string; baseRevisionHash: string; updatedAt: number; stale: boolean } | null> {
  try {
    const bridge = getBridge()?.draft;
    if (!bridge || typeof bridge.get !== "function") return null;
    const res = await bridge.get(workspaceId, relativePath);
    return res.ok ? res.result : null;
  } catch {
    return null;
  }
}

function safeDraftPut(args: { workspaceId: string; relativePath: string; baseRevisionHash: string; content: string }): void {
  try {
    const bridge = getBridge()?.draft;
    if (!bridge || typeof bridge.put !== "function") return;
    void bridge.put(args).catch(() => undefined);
  } catch {
    /* recovery-data only: never break editing */
  }
}

function safeDraftClear(workspaceId: string, relativePath: string): void {
  try {
    const bridge = getBridge()?.draft;
    if (!bridge || typeof bridge.clear !== "function") return;
    void bridge.clear(workspaceId, relativePath).catch(() => undefined);
  } catch {
    /* recovery-data only: never break saving */
  }
}

async function safeRecoveryCapture(args: {
  workspaceId: string;
  relativePath: string;
  content: string;
  reason: "edit" | "save" | "close" | "shutdown" | "restore-before";
}): Promise<void> {
  try {
    const bridge = getBridge()?.recovery;
    if (!bridge || typeof bridge.captureChanged !== "function") return;
    const res = await bridge.captureChanged(args);
    if (!res.ok) console.error("[recovery] snapshot failed", { code: res.error.code, message: res.error.message });
  } catch (err) {
    console.error("[recovery] snapshot failed", err);
  }
}

export type DocumentsApi = {
  layout: PaneLayout;
  activeTab: ReturnType<typeof activeDoc>;
  cursor: Cursor;
  words: number;
  saveView: SaveView;
  recovery: Record<string, RecoveryEntry>;
  historyDialog: HistoryDialogState | null;
  closeHistory: () => void;
  openFile: (relativePath: string) => Promise<void>;
  onEdit: (docKey: string, content: string) => void;
  save: (docKey?: string) => Promise<void>;
  reloadFromDisk: (docKey?: string) => Promise<void>;
  reconcileExternalChange: (relativePath: string) => Promise<void>;
  keepMyVersion: (docKey?: string) => Promise<void>;
  renameNoteTitle: (docKey: string, title: string) => Promise<boolean>;
  closeTab: (key: string) => void;
  togglePinnedTab: (key: string) => void;
  reopenClosedTab: () => Promise<void>;
  renameEntryDocs: (workspaceId: string, oldRel: string, newRel: string) => void;
  removeEntryDocs: (workspaceId: string, entryRel: string) => void;
  restoreDraft: (key: string) => void;
  discardDraft: (key: string) => void;
  openHistory: (docKey?: string) => Promise<void>;
  copyRecoverySnapshot: (snapshotId: string) => Promise<void>;
  restoreRecoverySnapshot: (snapshotId: string) => Promise<void>;
  activateDocKey: (key: string) => void;
  cycleTab: (forward: boolean) => void;
  activateTabByIndex: (index: number) => void;
  reorderTabs: (from: string, to: string) => void;
  handleCursor: (line: number, col: number) => void;
  reset: () => void;
};

/** Open documents + crash-recovery drafts + history. One lifecycle: dirty
 * buffers feed drafts, saves obsolete them, restores resolve them — so
 * layout and recovery live in one domain hook, not two. */
export function useDocuments(
  workspace: WorkspaceInfo | null,
  notify: Notify,
  recents: RecentsApi,
): DocumentsApi {
  const { toast, errToast } = notify;
  const bumpIndex = useIndexMeta((s) => s.bump);
  // Single tab layout. Dirty, revision baselines, conflict, and save
  // progress live per DOCUMENT — saving one tab never alters another's
  // state. Layout is window-local, never persisted.
  const [layout, setLayout] = useState(() => createLayout());
  const [cursor, setCursor] = useState<Cursor>({ line: 1, col: 1 });
  // Crash-recovery drafts (userData store, main process). Keyed by tab key.
  // This is RECOVERY data only: `Saved` is shown exclusively for bytes that
  // reached the note file. A persisted draft never flips the save indicator.
  const [recovery, setRecovery] = useState<Record<string, RecoveryEntry>>({});
  const [historyDialog, setHistoryDialog] = useState<HistoryDialogState | null>(null);
  const recoveryLastEditCapture = useRef<Record<string, number>>({});

  const activeTab = activeDoc(layout);

  const openFile = useCallback(async (relativePath: string) => {
    if (!workspace) return;
    const key = `${workspace.workspaceId}:${relativePath}`;
    if (layout.docs[key]) {
      // Already open: reveal it. State (dirty/conflict/baseline) is kept —
      // reopening never resets revision baselines.
      setLayout((l) => activateDoc(l, key));
      setCursor({ line: 1, col: 1 });
      return;
    }
    // Recovery draft check runs alongside the read (paths only, never contents, in logs).
    // safeDraftGet degrades to null against a stale main/preload without draft support.
    const bridge = getBridge();
    if (!bridge) { toast("Desktop bridge unavailable — open via the Electron app.", "error"); return; }
    const [res, draft] = await Promise.all([
      bridge.file.read(workspace.workspaceId, relativePath),
      safeDraftGet(workspace.workspaceId, relativePath),
    ]);
    if (!res.ok) {
      // Trace the full read chain (renderer → IPC → supervisor → helper).
      // Paths only, never contents.
      console.error("[file-read] open failed", {
        workspaceId: workspace.workspaceId,
        workspaceType: workspace.type,
        relativePath,
        code: res.error.code,
        message: res.error.message,
      });
      if ((res.error.code === "NOT_FOUND" || res.error.code === "INVALID_PATH") && draft && draft.content) {
        // File deleted/moved externally: retain the draft as an unsaved tab.
        // The note file is untouched (it is already gone); nothing is written.
        setLayout((l) => openDocInPane(l, "main", { key, relativePath, content: draft.content, dirty: true, revisionHash: "", newlineStyle: "lf", hadBom: false, conflict: false, loadError: null, saving: false, savedAt: "" }));
        setCursor({ line: 1, col: 1 });
        setRecovery((p) => ({ ...p, [key]: { content: draft.content, updatedAt: draft.updatedAt, stale: draft.stale, diskChanged: true } }));
        toast("The original file is gone. Your unsaved draft was retained — save it to keep it.", "error");
        return;
      }
      if (res.error.code === "TOO_LARGE" || res.error.code === "UNSUPPORTED_ENCODING") {
        setLayout((l) => openDocInPane(l, "main", { key, relativePath, content: "", dirty: false, revisionHash: "", newlineStyle: "lf", hadBom: false, conflict: false, loadError: res.error.message, saving: false, savedAt: "" }));
      } else errToast(res.error, `Couldn't open ${fileName(relativePath)}`);
      return;
    }
    const file = res.result;
    setLayout((l) => openDocInPane(l, "main", { key, relativePath, content: file.content, dirty: false, revisionHash: file.revision.hash, newlineStyle: file.newlineStyle, hadBom: file.hadBom, conflict: false, loadError: null, saving: false, savedAt: "" }));
    setCursor({ line: 1, col: 1 });
    if (draft && draft.content !== file.content) {
      // A recovery draft exists and differs from disk: never auto-apply.
      // baseRevisionHash === current disk hash → disk unchanged since the
      // draft was taken → offer restore. Otherwise BOTH are kept and the
      // user chooses explicitly (reload-from-disk vs restore-draft).
      setRecovery((p) => ({
        ...p,
        [key]: { content: draft.content, updatedAt: draft.updatedAt, stale: draft.stale, diskChanged: draft.baseRevisionHash !== file.revision.hash },
      }));
    } else if (draft) {
      // Draft matches disk: nothing to recover; drop it silently.
      safeDraftClear(workspace.workspaceId, relativePath);
    }
    recents.recordFile(relativePath);
  }, [workspace, layout, toast, errToast, recents]);

  // Edits name their document so tab switching never changes which buffer
  // gets dirtied.
  const onEdit = useCallback((docKey: string, content: string) => {
    setLayout((l) => updateDocContent(l, docKey, content));
    const doc = layout.docs[docKey];
    if (!workspace || !doc || doc.loadError) return;
    const now = Date.now();
    const last = recoveryLastEditCapture.current[docKey] ?? 0;
    if (last === 0 || now - last >= 5 * 60 * 1000) {
      recoveryLastEditCapture.current[docKey] = now;
      void safeRecoveryCapture({ workspaceId: workspace.workspaceId, relativePath: doc.relativePath, content, reason: "edit" });
    }
  }, [workspace, layout]);

  // Save names its document explicitly (default: active tab). Only the
  // target doc's dirty/conflict/baseline change — neighbors are untouched.
  // No save/conflict semantics change (P1-05 owns those).
  const save = useCallback(async (docKey?: string) => {
    if (!workspace) return;
    const target = docKey ? layout.docs[docKey] : activeDoc(layout);
    if (!target || target.loadError) return;
    const key = target.key;
    await safeRecoveryCapture({ workspaceId: workspace.workspaceId, relativePath: target.relativePath, content: target.content, reason: "save" });
    recoveryLastEditCapture.current[key] = Date.now();
    setLayout((l) => markSaving(l, key, true));
    const bridge = getBridge();
    if (!bridge) { setLayout((l) => markSaving(l, key, false)); toast("Desktop bridge unavailable — open via the Electron app.", "error"); return; }
    const res = await bridge.file.write({
      workspaceId: workspace.workspaceId,
      relativePath: target.relativePath,
      content: target.content,
      expectedHash: target.revisionHash,
      newlineStyle: target.newlineStyle,
      hadBom: target.hadBom,
    });
    if (!res.ok) {
      if (res.error.code === "CONFLICT") {
        setLayout((l) => markConflict(l, key));
      } else {
        setLayout((l) => markSaving(l, key, false));
        errToast(res.error, `Couldn't save ${fileName(target.relativePath)}. Your edits are still safe`);
      }
      return;
    }
    setLayout((l) => {
      const cur = l.docs[key];
      const saved = markSaved(l, key, res.result.hash, new Date().toLocaleTimeString());
      // Keystrokes typed during the write must stay dirty against the new
      // baseline — otherwise autosave never refires and they die on close.
      return cur && cur.content !== target.content ? updateDocContent(saved, key, cur.content) : saved;
    });
    // File changed → replace exactly this index entry (content + the
    // authoritative post-write revision: zero extra reads).
    syncFileIndex(workspaceIndex, workspace.workspaceId, target.relativePath, target.content, res.result);
    bumpIndex();
    // The file now holds the truth: the recovery draft is obsolete.
    setRecovery((p) => {
      if (!(key in p)) return p;
      const next = { ...p };
      delete next[key];
      return next;
    });
    safeDraftClear(workspace.workspaceId, target.relativePath);
  }, [workspace, layout, errToast, bumpIndex]);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    if (!workspace) return;
    const dirtyDocs = Object.values(layout.docs).filter((d) => d.dirty && !d.saving && !d.conflict && !d.loadError && d.revisionHash);
    if (dirtyDocs.length === 0) return;
    autosaveTimer.current = setTimeout(() => {
      autosaveTimer.current = null;
      for (const doc of dirtyDocs) void save(doc.key);
    }, 1_500);
    return () => {
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
    };
  }, [workspace, layout.docs, save]);

  const reloadFromDisk = useCallback(async (docKey?: string) => {
    if (!workspace) return;
    const target = docKey ? layout.docs[docKey] : activeDoc(layout);
    if (!target) return;
    console.error("[file-read] reload request", {
      workspaceId: workspace.workspaceId,
      workspaceType: workspace.type,
      relativePath: target.relativePath,
    });
    const bridge = getBridge();
    if (!bridge) { errToast({ code: "INTERNAL_ERROR", message: "Desktop bridge unavailable." }, "Couldn't reload from disk"); return; }
    const res = await bridge.file.read(workspace.workspaceId, target.relativePath);
    if (!res.ok) {
      console.error("[file-read] reload failed", {
        workspaceId: workspace.workspaceId,
        workspaceType: workspace.type,
        relativePath: target.relativePath,
        code: res.error.code,
        message: res.error.message,
      });
      errToast(res.error, "Couldn't reload from disk"); return; }
    setLayout((l) => resolveDoc(l, target.key, res.result.content, res.result.revision.hash));
    syncFileIndex(workspaceIndex, workspace.workspaceId, target.relativePath, res.result.content, res.result.revision);
    bumpIndex();
  }, [workspace, layout, errToast, bumpIndex]);

  const reconcileExternalChange = useCallback(async (relativePath: string) => {
    if (!workspace) return;
    const key = `${workspace.workspaceId}:${relativePath}`;
    const target = layout.docs[key];
    const bridge = getBridge();
    if (!bridge) return;
    const res = await bridge.file.read(workspace.workspaceId, relativePath);
    if (!res.ok) {
      workspaceIndex.remove(workspace.workspaceId, relativePath);
      bumpIndex();
      return;
    }
    syncFileIndex(workspaceIndex, workspace.workspaceId, relativePath, res.result.content, res.result.revision);
    bumpIndex();
    if (!target) return;
    if (target.dirty) {
      setLayout((l) => markConflict(l, key));
      toast("File changed on disk. Your unsaved edits were kept; reload or retry save to resolve.", "error");
      return;
    }
    setLayout((l) => resolveDoc(l, key, res.result.content, res.result.revision.hash));
  }, [workspace, layout, bumpIndex, toast]);

  const keepMyVersion = useCallback(async (docKey?: string) => {
    if (!workspace) return;
    const target = docKey ? layout.docs[docKey] : activeDoc(layout);
    if (!target) return;
    const bridge = getBridge();
    if (!bridge) { errToast({ code: "INTERNAL_ERROR", message: "Desktop bridge unavailable." }); return; }
    const res = await bridge.file.read(workspace.workspaceId, target.relativePath);
    if (!res.ok) { errToast(res.error); return; }
    const diskHash = res.result.revision.hash;
    const res2 = await bridge.file.write({
      workspaceId: workspace.workspaceId, relativePath: target.relativePath, content: target.content,
      expectedHash: diskHash, newlineStyle: target.newlineStyle, hadBom: target.hadBom,
    });
    if (!res2.ok) { errToast(res2.error); return; }
    setLayout((l) => {
      const cur = l.docs[target.key];
      const saved = markSaved(l, target.key, res2.result.hash, new Date().toLocaleTimeString());
      return cur && cur.content !== target.content ? updateDocContent(saved, target.key, cur.content) : saved;
    });
    // Conflict resolved by overwrite: the file changed → re-parse it.
    syncFileIndex(workspaceIndex, workspace.workspaceId, target.relativePath, target.content, res2.result);
    bumpIndex();
  }, [workspace, layout, errToast, bumpIndex]);

  const titleToFileName = useCallback((title: string): string | null => {
    const base = title
      .trim()
      .replace(/[\\/:*?"<>|\0]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!base) return null;
    return `${base}.md`;
  }, []);

  const renameNoteTitle = useCallback(async (docKey: string, title: string): Promise<boolean> => {
    if (!workspace) return false;
    const target = layout.docs[docKey];
    if (!target || target.loadError) return false;
    const newName = titleToFileName(title);
    if (!newName) return false;
    const oldDir = parentDir(target.relativePath);
    const newRel = joinRel(oldDir, newName);
    if (newRel === target.relativePath) return true;
    const bridge = getBridge();
    if (!bridge) { errToast({ code: "INTERNAL_ERROR", message: "Desktop bridge unavailable." }, "Couldn't rename note"); return false; }
    const autoUpdateLinks = useSettingsStore.getState().settings.autoUpdateLinks;
    if (!autoUpdateLinks && !window.confirm(`Rename "${fileName(target.relativePath)}" without updating links that point to it?`)) return false;
    const res = await bridge.file.rename(workspace.workspaceId, target.relativePath, newRel, { autoUpdateLinks });
    if (!res.ok) { errToast(res.error, "Couldn't rename note"); return false; }
    setLayout((l) => applyRename(l, workspace.workspaceId, target.relativePath, newRel));
    workspaceIndex.move(workspace.workspaceId, target.relativePath, newRel);
    bumpIndex();
    const newKey = `${workspace.workspaceId}:${newRel}`;
    setRecovery((p) => {
      if (!(target.key in p)) return p;
      const next = { ...p };
      next[newKey] = next[target.key]!;
      delete next[target.key];
      return next;
    });
    return true;
  }, [workspace, layout, titleToFileName, errToast, bumpIndex]);

  const closeTab = useCallback((key: string) => {
    // Dirty tabs are never silently discarded: flush the dirty buffer into
    // the EXISTING draft store first (P1-10 owns recovery; this only feeds
    // it — no second unsaved-content system). Closing still does NOT delete
    // drafts: a quit-with-dirty followed by restart must offer recovery.
    const doc = layout.docs[key];
    if (workspace && doc && doc.dirty && !doc.loadError && doc.revisionHash) {
      void safeRecoveryCapture({ workspaceId: workspace.workspaceId, relativePath: doc.relativePath, content: doc.content, reason: "close" });
      safeDraftPut({
        workspaceId: workspace.workspaceId,
        relativePath: doc.relativePath,
        baseRevisionHash: doc.revisionHash,
        content: doc.content,
      });
    }
    setLayout((l) => closeDocInPane(l, "main", key).layout);
    setCursor({ line: 1, col: 1 });
  }, [workspace, layout]);

  const togglePinnedTab = useCallback((key: string) => {
    setLayout((l) => togglePinned(l, key));
  }, []);

  const reopenClosedTab = useCallback(async () => {
    const rel = layout.closedTabs[0];
    if (!rel) return;
    setLayout((l) => popClosedTab(l).layout);
    await openFile(rel);
  }, [layout.closedTabs, openFile]);

  /* ---------- crash-recovery drafts ---------- */
  // Debounced (750 ms): keystroke bursts collapse into one main-process
  // write. The indicator stays `Unsaved changes`-style dirty — a persisted
  // draft never displays `Saved`.
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (draftTimer.current) {
      clearTimeout(draftTimer.current);
      draftTimer.current = null;
    }
    if (!workspace || !activeTab || !activeTab.dirty || activeTab.loadError || !activeTab.revisionHash) return;
    const wsId = workspace.workspaceId;
    const rel = activeTab.relativePath;
    const content = activeTab.content;
    const base = activeTab.revisionHash;
    draftTimer.current = setTimeout(() => {
      draftTimer.current = null;
      safeDraftPut({ workspaceId: wsId, relativePath: rel, baseRevisionHash: base, content });
    }, 750);
    return () => {
      if (draftTimer.current) {
        clearTimeout(draftTimer.current);
        draftTimer.current = null;
      }
    };
  }, [workspace, activeTab?.key, activeTab?.content, activeTab?.dirty]);

  // Best effort: persist dirty tabs synchronously on unload (debounce may not have fired).
  useEffect(() => {
    const onUnload = (): void => {
      if (draftTimer.current) {
        clearTimeout(draftTimer.current);
        draftTimer.current = null;
      }
      if (workspace) {
        for (const doc of Object.values(layout.docs)) {
          if (doc.dirty && !doc.loadError && doc.revisionHash) {
            void safeRecoveryCapture({ workspaceId: workspace.workspaceId, relativePath: doc.relativePath, content: doc.content, reason: "shutdown" });
            safeDraftPut({
              workspaceId: workspace.workspaceId,
              relativePath: doc.relativePath,
              baseRevisionHash: doc.revisionHash,
              content: doc.content,
            });
          }
        }
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [workspace, layout]);

  const restoreDraft = useCallback((key: string) => {
    const rec = recovery[key];
    if (!rec) return;
    setLayout((l) => updateDocContent(l, key, rec.content));
  }, [recovery]);

  const discardDraft = useCallback((key: string) => {
    if (!workspace) return;
    const doc = layout.docs[key];
    if (doc) safeDraftClear(workspace.workspaceId, doc.relativePath);
    setRecovery((p) => {
      const next = { ...p };
      delete next[key];
      return next;
    });
  }, [workspace, layout]);

  const openHistory = useCallback(async (docKey?: string) => {
    if (!workspace) return;
    const doc = docKey ? layout.docs[docKey] : activeDoc(layout);
    if (!doc) return;
    setHistoryDialog({ docKey: doc.key, loading: true, error: null, snapshots: [] });
    try {
      const bridge = getBridge();
      if (!bridge) { setHistoryDialog({ docKey: doc.key, loading: false, error: "Desktop bridge unavailable.", snapshots: [] }); return; }
      const res = await bridge.recovery.list(workspace.workspaceId, doc.relativePath);
      if (!res.ok) {
        setHistoryDialog({ docKey: doc.key, loading: false, error: res.error.message, snapshots: [] });
        return;
      }
      setHistoryDialog({ docKey: doc.key, loading: false, error: null, snapshots: res.result });
    } catch (err) {
      setHistoryDialog({ docKey: doc.key, loading: false, error: String(err), snapshots: [] });
    }
  }, [workspace, layout]);

  const copyRecoverySnapshot = useCallback(async (snapshotId: string) => {
    if (!workspace) return;
    const bridge = getBridge();
    if (!bridge) { errToast({ code: "INTERNAL_ERROR", message: "Desktop bridge unavailable." }, "Couldn't copy recovery snapshot"); return; }
    const res = await bridge.recovery.read(workspace.workspaceId, snapshotId);
    if (!res.ok) { errToast(res.error, "Couldn't copy recovery snapshot"); return; }
    await navigator.clipboard.writeText(res.result.content);
    toast("Copied recovery snapshot contents.");
  }, [workspace, errToast, toast]);

  const restoreRecoverySnapshot = useCallback(async (snapshotId: string) => {
    if (!workspace || !historyDialog) return;
    const doc = layout.docs[historyDialog.docKey];
    if (!doc || doc.loadError) return;
    if (!window.confirm(`Restore this recovery snapshot over ${fileName(doc.relativePath)}? The current editor content will be snapshotted first.`)) return;
    const bridge = getBridge();
    if (!bridge) { errToast({ code: "INTERNAL_ERROR", message: "Desktop bridge unavailable." }, "Couldn't restore recovery snapshot"); return; }
    const res = await bridge.recovery.restore({
      workspaceId: workspace.workspaceId,
      relativePath: doc.relativePath,
      snapshotId,
      currentContent: doc.content,
      expectedHash: doc.revisionHash,
      newlineStyle: doc.newlineStyle,
      hadBom: doc.hadBom,
    });
    if (!res.ok) {
      if (res.error.code === "CONFLICT") setLayout((l) => markConflict(l, doc.key));
      errToast(res.error, "Couldn't restore recovery snapshot");
      return;
    }
    setLayout((l) => resolveDoc(l, doc.key, res.result.content, res.result.revision.hash));
    syncFileIndex(workspaceIndex, workspace.workspaceId, doc.relativePath, res.result.content, res.result.revision);
    bumpIndex();
    safeDraftClear(workspace.workspaceId, doc.relativePath);
    setRecovery((p) => {
      if (!(doc.key in p)) return p;
      const next = { ...p };
      delete next[doc.key];
      return next;
    });
    await openHistory(doc.key);
    toast("Restored recovery snapshot. The previous current content was snapshotted first.");
  }, [workspace, historyDialog, layout, errToast, toast, openHistory, bumpIndex]);

  const activateDocKey = useCallback((key: string) => {
    setLayout((l) => activateDoc(l, key));
    setCursor({ line: 1, col: 1 });
  }, []);

  const cycleTab = useCallback((forward: boolean) => {
    const keys = paneDocs(layout).map((d) => d.key);
    const cur = activeDoc(layout)?.key;
    if (keys.length < 2 || !cur) return;
    const i = keys.indexOf(cur);
    const n = keys[(i + (forward ? 1 : keys.length - 1)) % keys.length]!;
    setLayout((l) => activateDoc(l, n));
    setCursor({ line: 1, col: 1 });
  }, [layout]);

  const activateTabByIndex = useCallback((index: number) => {
    setLayout((l) => activateTabByIndexInLayout(l, index));
    setCursor({ line: 1, col: 1 });
  }, []);

  const reorderTabs = useCallback((from: string, to: string) => {
    setLayout((l) => reorderTabsInLayout(l, from, to));
  }, []);

  const renameEntryDocs = useCallback((workspaceId: string, oldRel: string, newRel: string) => {
    const oldKey = `${workspaceId}:${oldRel}`;
    const newKey = `${workspaceId}:${newRel}`;
    setLayout((l) => applyRename(l, workspaceId, oldRel, newRel));
    setRecovery((p) => {
      if (!(oldKey in p)) return p;
      const next = { ...p };
      next[newKey] = next[oldKey]!;
      delete next[oldKey];
      return next;
    });
  }, []);

  const removeEntryDocs = useCallback((workspaceId: string, entryRel: string) => {
    const prefix = `${workspaceId}:${entryRel}`;
    setLayout((l) => removeDocsForEntry(l, workspaceId, entryRel));
    setRecovery((p) => {
      let changed = false;
      const next = { ...p };
      for (const k of Object.keys(next)) {
        if (k === prefix || k.startsWith(`${prefix}/`)) { delete next[k]; changed = true; }
      }
      return changed ? next : p;
    });
  }, []);

  // Cursor reports come from the active pane's editor only (PaneView gates
  // with reportCursor); switching panes never steals keyboard focus.
  const handleCursor = useCallback((line: number, col: number) => {
    setCursor((p) => (p.line === line && p.col === col ? p : { line, col }));
  }, []);

  const reset = useCallback(() => {
    setLayout(createLayout());
    setCursor({ line: 1, col: 1 });
  }, []);

  const words = useMemo(() => {
    const c = activeTab?.content.trim() ?? "";
    return c ? c.split(/\s+/).length : 0;
  }, [activeTab?.content]);

  // Status save segment derives from the ACTIVE document: a conflict
  // elsewhere never poisons this indicator.
  const saveView: SaveView = !activeTab
    ? "clean"
    : activeTab.conflict
      ? "conflict"
      : activeTab.saving
        ? "saving"
        : activeTab.dirty
          ? "dirty"
          : activeTab.savedAt
            ? "saved"
            : "clean";

  return {
    layout, activeTab, cursor, words, saveView, recovery, historyDialog,
    closeHistory: () => setHistoryDialog(null),
    openFile, onEdit, save, reloadFromDisk, reconcileExternalChange, keepMyVersion,
    renameNoteTitle, closeTab, togglePinnedTab, reopenClosedTab,
    renameEntryDocs, removeEntryDocs,
    restoreDraft, discardDraft, openHistory, copyRecoverySnapshot, restoreRecoverySnapshot,
    activateDocKey, cycleTab, activateTabByIndex, reorderTabs,
    handleCursor, reset,
  };
}
