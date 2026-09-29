import { create } from "zustand";

type IndexMetaStore = {
  /** Bumped on every index mutation so memoised readers re-derive. */
  version: number;
  bump: () => void;
  /** Completeness notice (partial-index bounds) shown in status + search. */
  notice: string | null;
  setNotice: (n: string | null) => void;
};

/** Cross-cutting index signals. The parse-once index itself is a module
 * singleton (`index/workspace-index`); this store owns only the tiny
 * reactive bits every domain (docs, tree, search, status bar) needs. */
export const useIndexMeta = create<IndexMetaStore>()((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
  notice: null,
  setNotice: (notice) => set({ notice }),
}));
