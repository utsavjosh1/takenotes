import { create } from "zustand";
import { renameImpact, renameSummary } from "@takenotes/core/save/rename-impact";
import { workspaceIndex } from "../index/workspace-index";

export type RenamePreview = { from: string; to: string; summary: string; resolve: (go: boolean) => void };

export const useRenamePreview = create<{ pending: RenamePreview | null }>()(() => ({ pending: null }));

/** Ask before a rename: shows what happens to links that point at it. Resolves true to go ahead. */
export function askRename(workspaceId: string, fromRel: string, toRel: string, isFolder: boolean, autoUpdateLinks: boolean): Promise<boolean> {
  const impact = renameImpact(workspaceIndex.edges(workspaceId), fromRel, isFolder);
  // Nothing points here and nothing is lost: no need to interrupt.
  if (impact.links === 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    useRenamePreview.setState({ pending: {
      from: fromRel, to: toRel, summary: renameSummary(impact, autoUpdateLinks),
      resolve: (go) => { useRenamePreview.setState({ pending: null }); resolve(go); },
    } });
  });
}
