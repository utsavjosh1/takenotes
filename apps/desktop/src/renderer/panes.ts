import type { TabState } from "./components/types";

/** Single-window tab layout.
 *
 * Roadmap Step 1 explicitly excludes editor splits/stacked panes/pop-outs.
 * This module therefore models exactly one tab strip and one active editor.
 * Documents still carry dirty/revision/conflict state independently so save
 * or conflict in one tab never leaks into another.
 */
export type DocState = TabState;

export type TabLayout = {
  docs: Record<string, DocState>;
  openKeys: string[];
  activeKey: string | null;
  /** Most-recently closed relative paths for Ctrl+Shift+T. */
  closedTabs: string[];
};

export type PaneLayout = TabLayout;

function patchDoc(layout: TabLayout, key: string, patch: Partial<DocState>): TabLayout {
  const doc = layout.docs[key];
  if (!doc) return layout;
  return { ...layout, docs: { ...layout.docs, [key]: { ...doc, ...patch } } };
}

function pruneDocs(layout: TabLayout): TabLayout {
  const keep = new Set(layout.openKeys);
  const docs: Record<string, DocState> = {};
  for (const [key, doc] of Object.entries(layout.docs)) {
    if (keep.has(key)) docs[key] = doc;
  }
  return { ...layout, docs };
}

export function createLayout(): TabLayout {
  return { docs: {}, openKeys: [], activeKey: null, closedTabs: [] };
}

export function openDoc(layout: TabLayout, doc: DocState): TabLayout {
  const docs = layout.docs[doc.key] ? layout.docs : { ...layout.docs, [doc.key]: doc };
  const openKeys = layout.openKeys.includes(doc.key) ? layout.openKeys : [...layout.openKeys, doc.key];
  return {
    ...layout,
    docs,
    openKeys,
    activeKey: doc.key,
    closedTabs: layout.closedTabs.filter((rel) => rel !== doc.relativePath),
  };
}

export function activateDoc(layout: TabLayout, key: string): TabLayout {
  if (!layout.openKeys.includes(key)) return layout;
  return { ...layout, activeKey: key };
}

export function activeDoc(layout: TabLayout): DocState | null {
  if (!layout.activeKey) return null;
  return layout.docs[layout.activeKey] ?? null;
}

export function tabDocs(layout: TabLayout): DocState[] {
  return layout.openKeys.map((key) => layout.docs[key]).filter((doc): doc is DocState => Boolean(doc));
}

export type CloseResult = {
  layout: TabLayout;
  closed: DocState | null;
  orphaned: boolean;
};

export function closeDoc(layout: TabLayout, key: string): CloseResult {
  const closed = layout.docs[key] ?? null;
  if (!closed) return { layout, closed: null, orphaned: false };
  const index = layout.openKeys.indexOf(key);
  const openKeys = layout.openKeys.filter((k) => k !== key);
  const activeKey = layout.activeKey === key ? (openKeys[Math.min(index, openKeys.length - 1)] ?? null) : layout.activeKey;
  const next = pruneDocs({
    ...layout,
    openKeys,
    activeKey,
    closedTabs: [closed.relativePath, ...layout.closedTabs.filter((rel) => rel !== closed.relativePath)].slice(0, 20),
  });
  return { layout: next, closed, orphaned: true };
}

export function popClosedTab(layout: TabLayout): { layout: TabLayout; relativePath: string | null } {
  const [relativePath, ...closedTabs] = layout.closedTabs;
  return { layout: { ...layout, closedTabs }, relativePath: relativePath ?? null };
}

export function updateDocContent(layout: TabLayout, key: string, content: string): TabLayout {
  return patchDoc(layout, key, { content, dirty: true });
}

export function markSaving(layout: TabLayout, key: string, saving: boolean): TabLayout {
  return patchDoc(layout, key, { saving });
}

export function markSaved(layout: TabLayout, key: string, revisionHash: string, savedAt: string): TabLayout {
  return patchDoc(layout, key, { dirty: false, conflict: false, saving: false, revisionHash, savedAt });
}

export function markConflict(layout: TabLayout, key: string): TabLayout {
  return patchDoc(layout, key, { conflict: true, saving: false });
}

export function resolveDoc(layout: TabLayout, key: string, content: string, revisionHash: string): TabLayout {
  return patchDoc(layout, key, { content, dirty: false, conflict: false, saving: false, revisionHash });
}

export function togglePinned(layout: TabLayout, key: string): TabLayout {
  const doc = layout.docs[key];
  if (!doc) return layout;
  return patchDoc(layout, key, { pinned: !doc.pinned });
}

function docKey(workspaceId: string, relativePath: string): string {
  return `${workspaceId}:${relativePath}`;
}

export function applyRename(layout: TabLayout, workspaceId: string, oldRel: string, newRel: string): TabLayout {
  const oldKey = docKey(workspaceId, oldRel);
  const newKey = docKey(workspaceId, newRel);
  const doc = layout.docs[oldKey];
  if (!doc) return layout;
  const docs = { ...layout.docs };
  delete docs[oldKey];
  docs[newKey] = { ...doc, key: newKey, relativePath: newRel };
  return {
    ...layout,
    docs,
    openKeys: layout.openKeys.map((key) => (key === oldKey ? newKey : key)),
    activeKey: layout.activeKey === oldKey ? newKey : layout.activeKey,
    closedTabs: layout.closedTabs.map((rel) => (rel === oldRel ? newRel : rel)),
  };
}

export function removeDocsForEntry(layout: TabLayout, workspaceId: string, entryRel: string): TabLayout {
  const prefix = `${workspaceId}:${entryRel}`;
  const dropKey = (key: string): boolean => key === prefix || key.startsWith(`${prefix}/`);
  const openKeys = layout.openKeys.filter((key) => !dropKey(key));
  const activeKey = layout.activeKey && dropKey(layout.activeKey) ? (openKeys[0] ?? null) : layout.activeKey;
  const next = pruneDocs({ ...layout, openKeys, activeKey });
  const closedTabs = next.closedTabs.filter((rel) => rel !== entryRel && !rel.startsWith(`${entryRel}/`));
  return { ...next, closedTabs };
}

export function reorderTabs(layout: TabLayout, from: string, to: string): TabLayout {
  const a = layout.openKeys.indexOf(from);
  const b = layout.openKeys.indexOf(to);
  if (a < 0 || b < 0) return layout;
  const openKeys = [...layout.openKeys];
  const [moved] = openKeys.splice(a, 1);
  openKeys.splice(b, 0, moved!);
  return { ...layout, openKeys };
}

export function activateTabByIndex(layout: TabLayout, index: number): TabLayout {
  const key = layout.openKeys[index];
  return key ? activateDoc(layout, key) : layout;
}

// Compatibility aliases for older callers/tests while the renderer finishes
// the split-pane cleanup. They all target the single tab strip.
export const openDocInPane = (layout: TabLayout, _paneId: string, doc: DocState): TabLayout => openDoc(layout, doc);
export const closeDocInPane = (layout: TabLayout, _paneId: string, key: string): CloseResult => closeDoc(layout, key);
export const paneDocs = (layout: TabLayout, _paneId?: string): DocState[] => tabDocs(layout);
