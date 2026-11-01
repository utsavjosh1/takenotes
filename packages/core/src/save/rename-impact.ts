import type { Edge } from "../index/edges";

export type RenameImpact = { links: number; notes: number };

/** How many links point at `oldRel` (or, for a folder, anything inside it), and from how many other notes. */
export function renameImpact(edges: Edge[], oldRel: string, isFolder: boolean): RenameImpact {
  const sources = new Set<string>();
  let links = 0;
  for (const e of edges) {
    if (e.kind === "tag" || e.kind === "task" || e.to === null) continue;
    const hit = isFolder ? e.to.startsWith(`${oldRel}/`) : e.to === oldRel;
    if (!hit) continue;
    const inside = isFolder ? e.from.startsWith(`${oldRel}/`) : e.from === oldRel;
    if (inside) continue;
    links += 1;
    sources.add(e.from);
  }
  return { links, notes: sources.size };
}

/** The plain sentence the rename preview leads with. */
export function renameSummary(impact: RenameImpact, willUpdate: boolean): string {
  if (impact.links === 0) return "No other notes link to it.";
  const l = `${impact.links} link${impact.links === 1 ? "" : "s"}`;
  const n = `${impact.notes} note${impact.notes === 1 ? "" : "s"}`;
  return willUpdate ? `${l} in ${n} will be updated to the new name.` : `${l} in ${n} will stop working. They aren’t updated.`;
}
