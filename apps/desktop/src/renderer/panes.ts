import type { TabState } from "./components/types";

/** Shared open-document registry + two-pane layout (P1-06).
 *
 * One `DocState` per open file (`workspaceId:relativePath`): dirty,
 * revision baseline, conflict, and save progress live on the DOCUMENT, so
 * two panes on the same file always agree (edit in one → dirty in both;
 * save in either → both clean with the new revision). Panes only hold
 * open-key lists + their own active key. Pure functions — no React —
 * tested in tests/renderer/panes.test.ts.
 *
 * Phase 1 caps at TWO panes: a simple side-by-side model, not an IDE
 * layout tree. Layout is window-local and never persisted. No file
 * semantics change here: save/conflict behavior stays P1-05-owned.
 */
export type DocState = TabState;

export type PaneState = {
  id: string;
  openKeys: string[];
  activeKey: string | null;
};

export type PaneLayout = {
  docs: Record<string, DocState>;
  panes: PaneState[];
  activePaneId: string;
  orientation: "horizontal" | "vertical";
};

let paneSeq = 0;

function nextPaneId(): string {
  paneSeq += 1;
  return `pane-${paneSeq}-${Date.now().toString(36)}`;
}

function paneOf(layout: PaneLayout, paneId: string): PaneState {
  const pane = layout.panes.find((p) => p.id === paneId);
  if (!pane) throw new Error(`Unknown pane: ${paneId}`);
  return pane;
}

/** Docs no pane references anymore — safe to drop (drafts, not docs, are
 * the unsaved-content safety net; see closeDocInPane). */
function pruneOrphanDocs(layout: PaneLayout): PaneLayout {
  const referenced = new Set<string>();
  for (const p of layout.panes) for (const k of p.openKeys) referenced.add(k);
  const docs: Record<string, DocState> = {};
  for (const [k, d] of Object.entries(layout.docs)) {
    if (referenced.has(k)) docs[k] = d;
  }
  return { ...layout, docs };
}

function patchDoc(layout: PaneLayout, key: string, patch: Partial<DocState>): PaneLayout {
  const doc = layout.docs[key];
  if (!doc) return layout;
  return { ...layout, docs: { ...layout.docs, [key]: { ...doc, ...patch } } };
}

export function createLayout(): PaneLayout {
  const id = nextPaneId();
  return { docs: {}, panes: [{ id, openKeys: [], activeKey: null }], activePaneId: id, orientation: "vertical" };
}

/** Open (or reveal, if already open) a document in a pane. An already-open
 * doc keeps its dirty/conflict/baseline state — reopening never resets it. */
export function openDocInPane(layout: PaneLayout, paneId: string, doc: DocState): PaneLayout {
  const pane = paneOf(layout, paneId);
  const docs = layout.docs[doc.key] ? layout.docs : { ...layout.docs, [doc.key]: doc };
  const openKeys = pane.openKeys.includes(doc.key) ? pane.openKeys : [...pane.openKeys, doc.key];
  const panes = layout.panes.map((p) => (p.id === paneId ? { ...p, openKeys, activeKey: doc.key } : p));
  return { ...layout, docs, panes, activePaneId: paneId };
}

export function activateDoc(layout: PaneLayout, paneId: string, key: string): PaneLayout {
  const pane = paneOf(layout, paneId);
  if (!pane.openKeys.includes(key)) return layout;
  return {
    ...layout,
    activePaneId: paneId,
    panes: layout.panes.map((p) => (p.id === paneId ? { ...p, activeKey: key } : p)),
  };
}

/** Explicit active pane: save/close/open always name their pane — never
 * whichever component rendered last. */
export function activatePane(layout: PaneLayout, paneId: string): PaneLayout {
  paneOf(layout, paneId);
  return { ...layout, activePaneId: paneId };
}

export function activePane(layout: PaneLayout): PaneState {
  return paneOf(layout, layout.activePaneId);
}

/** Active pane → active key → shared doc (both panes see the same object). */
export function activeDoc(layout: PaneLayout): DocState | null {
  const pane = layout.panes.find((p) => p.id === layout.activePaneId);
  const key = pane?.activeKey;
  if (!key) return null;
  return layout.docs[key] ?? null;
}

export function paneDocs(layout: PaneLayout, paneId: string): DocState[] {
  const pane = paneOf(layout, paneId);
  const out: DocState[] = [];
  for (const k of pane.openKeys) {
    const d = layout.docs[k];
    if (d) out.push(d);
  }
  return out;
}

/** Split a pane. Orientation names the SPLIT line (VS Code convention):
 * "vertical" = side-by-side panes (Split right), "horizontal" = stacked
 * (Split down). Phase 1 caps at two panes; further splits are refused
 * (returned unchanged). The new pane opens on the source pane's active
 * document — the acceptance-1 setup in one action. */
export function splitPane(layout: PaneLayout, paneId: string, orientation: "horizontal" | "vertical"): PaneLayout {
  if (layout.panes.length >= 2) return layout;
  const source = paneOf(layout, paneId);
  const id = nextPaneId();
  const openKeys = source.activeKey ? [source.activeKey] : [];
  const next: PaneState = { id, openKeys, activeKey: source.activeKey };
  return { ...layout, panes: [...layout.panes, next], activePaneId: id, orientation };
}

/** Close a pane; the last pane cannot close. Docs referenced nowhere else
 * are pruned; the surviving pane keeps its own state untouched. */
export function closePane(layout: PaneLayout, paneId: string): PaneLayout {
  if (layout.panes.length <= 1) return layout;
  paneOf(layout, paneId);
  const panes = layout.panes.filter((p) => p.id !== paneId);
  const activePaneId = layout.activePaneId === paneId ? panes[0]!.id : layout.activePaneId;
  return pruneOrphanDocs({ ...layout, panes, activePaneId });
}

export type CloseResult = {
  layout: PaneLayout;
  /** The closed doc (state at close) — the caller flushes it to the draft
   * store when dirty, so dirty tabs are never silently discarded. Null
   * when the key wasn't open (layout returned unchanged). */
  closed: DocState | null;
  /** True when no remaining pane references the doc. */
  orphaned: boolean;
};

/** Close one document in one pane. Other panes on the same file are
 * unaffected; the doc entry survives while referenced anywhere. */
export function closeDocInPane(layout: PaneLayout, paneId: string, key: string): CloseResult {
  const pane = paneOf(layout, paneId);
  const closed = layout.docs[key] ?? null;
  if (!closed) return { layout, closed, orphaned: false };
  const openKeys = pane.openKeys.filter((k) => k !== key);
  let next: PaneLayout = {
    ...layout,
    panes: layout.panes.map((p) =>
      p.id === paneId
        ? { ...p, openKeys, activeKey: p.activeKey === key ? (openKeys[Math.min(openKeys.length - 1, Math.max(0, pane.openKeys.indexOf(key)))] ?? null) : p.activeKey }
        : p,
    ),
  };
  const stillReferenced = next.panes.some((p) => p.openKeys.includes(key));
  next = pruneOrphanDocs(next);
  return { layout: next, closed, orphaned: !stillReferenced };
}

export function updateDocContent(layout: PaneLayout, key: string, content: string): PaneLayout {
  return patchDoc(layout, key, { content, dirty: true });
}

export function markSaving(layout: PaneLayout, key: string, saving: boolean): PaneLayout {
  return patchDoc(layout, key, { saving });
}

export function markSaved(layout: PaneLayout, key: string, revisionHash: string, savedAt: string): PaneLayout {
  return patchDoc(layout, key, { dirty: false, conflict: false, saving: false, revisionHash, savedAt });
}

export function markConflict(layout: PaneLayout, key: string): PaneLayout {
  return patchDoc(layout, key, { conflict: true, saving: false });
}

/** Reload-from-disk resolution: fresh content becomes the clean baseline. */
export function resolveDoc(layout: PaneLayout, key: string, content: string, revisionHash: string): PaneLayout {
  return patchDoc(layout, key, { content, dirty: false, conflict: false, saving: false, revisionHash });
}

function docKey(workspaceId: string, relativePath: string): string {
  return `${workspaceId}:${relativePath}`;
}

/** Rename remaps open keys in place: content, dirty, and revision baselines
 * survive — switching/reopening never resets them. */
export function applyRename(layout: PaneLayout, workspaceId: string, oldRel: string, newRel: string): PaneLayout {
  const oldKey = docKey(workspaceId, oldRel);
  const newKey = docKey(workspaceId, newRel);
  const doc = layout.docs[oldKey];
  if (!doc) return layout;
  const docs = { ...layout.docs };
  delete docs[oldKey];
  docs[newKey] = { ...doc, key: newKey, relativePath: newRel };
  const panes = layout.panes.map((p) => ({
    ...p,
    openKeys: p.openKeys.map((k) => (k === oldKey ? newKey : k)),
    activeKey: p.activeKey === oldKey ? newKey : p.activeKey,
  }));
  return { ...layout, docs, panes };
}

/** File/folder delete drops the affected docs (exact key + folder prefix). */
export function removeDocsForEntry(layout: PaneLayout, workspaceId: string, entryRel: string): PaneLayout {
  const prefix = `${workspaceId}:${entryRel}`;
  const drop = (k: string): boolean => k === prefix || k.startsWith(`${prefix}/`);
  const docs: Record<string, DocState> = {};
  for (const [k, d] of Object.entries(layout.docs)) {
    if (!drop(k)) docs[k] = d;
  }
  const panes = layout.panes.map((p) => {
    const openKeys = p.openKeys.filter((k) => !drop(k));
    return { ...p, openKeys, activeKey: p.activeKey && drop(p.activeKey) ? (openKeys[0] ?? null) : p.activeKey };
  });
  return { ...layout, docs, panes };
}
