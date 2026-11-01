/**
 * Favourites: one calm list over `.takenotes/favorites.yaml`. Pin a note, folder, saved search
 * or heading; drag to reorder. A target that no longer exists is greyed with "Not found" and kept
 * until you remove it. Removing a favourite never touches the note itself, so it needs no confirmation.
 */
import { useState, type JSX } from "react";
import { Button } from "@takenotes/ui/dom";
import { splitAnchorTarget, type FavoriteEntry, type FavoritesDoc } from "@takenotes/core/favorites/store";
import type { FavoritesApi } from "../hooks/use-favorites";
import { displayPath, fileName } from "./types";

export type FavoriteOpen = {
  openFile: (rel: string) => void;
  revealDir: (rel: string) => void;
  runSearch: (query: string) => void;
};

export type FavoriteAnchorOpen = (rel: string, frag: string, isBlock: boolean) => void;

function labelOf(entry: FavoriteEntry): string {
  if (entry.alias?.trim()) return entry.alias.trim();
  if (entry.type === "search") return entry.target;
  if (entry.type === "file") return fileName(entry.target).replace(/\.md$/i, "");
  if (entry.type === "folder") return fileName(entry.target);
  const split = splitAnchorTarget(entry.target);
  return split ? `${fileName(split.rel).replace(/\.md$/i, "")} › ${split.frag}` : entry.target;
}

/** Unresolved when the target file/folder is absent from the workspace listing. */
export function isFavoriteResolved(entry: FavoriteEntry, filesLower: Set<string>, dirsLower: Set<string>): boolean {
  if (entry.type === "search") return true;
  if (entry.type === "file") return filesLower.has(entry.target.toLowerCase()) || dirsLower.has(entry.target.toLowerCase());
  if (entry.type === "folder") return dirsLower.has(entry.target.toLowerCase());
  const split = splitAnchorTarget(entry.target);
  if (!split) return false;
  return filesLower.has(split.rel.toLowerCase());
}

export function FavoritesPane({
  doc,
  favorites,
  files,
  dirs,
  open,
  openAnchor,
}: {
  doc: FavoritesDoc;
  favorites: FavoritesApi;
  /** Lower-cased relative paths of known files / directories. */
  files: Set<string>;
  dirs: Set<string>;
  open: FavoriteOpen;
  openAnchor?: FavoriteAnchorOpen;
}): JSX.Element {
  // Drag to reorder: a line shows where the row will land.
  const [drag, setDrag] = useState<{ group: string; index: number } | null>(null);
  const [drop, setDrop] = useState<{ group: string; index: number; after: boolean } | null>(null);

  if (favorites.loading) return <p className="fav-note" role="status">Loading…</p>;
  if (favorites.loadError) {
    return (
      <div className="fav-note" role="alert">
        <p>Couldn’t load your favourites.</p>
        <Button onClick={() => void favorites.reload()}>Try again</Button>
        <details className="err-details"><summary>Details</summary><pre>{favorites.loadError}</pre></details>
      </div>
    );
  }
  const total = doc.groups.reduce((n, g) => n + g.entries.length, 0);
  if (total === 0) {
    return (
      <div className="fav-note">
        <b>No favourites yet</b>
        <p>Click the star on a note, or right-click a note or folder and choose Add to favourites.</p>
      </div>
    );
  }
  const finishDrop = (): void => {
    if (drag && drop && drag.group === drop.group) {
      let to = drop.index + (drop.after ? 1 : 0);
      if (drag.index < to) to -= 1;
      if (to !== drag.index) void favorites.moveEntry(drag.group, drag.index, to);
    }
    setDrag(null); setDrop(null);
  };
  const openEntry = (entry: FavoriteEntry): void => {
    if (entry.type === "file") open.openFile(entry.target);
    else if (entry.type === "folder") open.revealDir(entry.target);
    else if (entry.type === "search") open.runSearch(entry.target);
    else {
      const split = splitAnchorTarget(entry.target);
      if (!split) return;
      if (openAnchor) openAnchor(split.rel, split.frag, entry.type === "block");
      else open.openFile(split.rel);
    }
  };
  return (
    <div className="fav-list">
      {doc.groups.map((group) => group.entries.length === 0 ? null : (
        <section key={group.name} aria-label={doc.groups.length > 1 ? group.name : "Favourites"}>
          {doc.groups.length > 1 && <h4 className="fav-group">{group.name}</h4>}
          {group.entries.map((entry, i) => {
            const resolved = isFavoriteResolved(entry, files, dirs);
            const cls = `fav-row${resolved ? "" : " missing"}${drop?.group === group.name && drop.index === i ? (drop.after ? " drop-after" : " drop-before") : ""}`;
            return (
              <div key={`${entry.type}:${entry.target}`} className={cls} draggable
                onDragStart={(e) => { setDrag({ group: group.name, index: i }); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("takenotes/favorite", String(i)); }}
                onDragOver={(e) => {
                  if (!drag) return;
                  e.preventDefault();
                  const r = e.currentTarget.getBoundingClientRect();
                  setDrop({ group: group.name, index: i, after: e.clientY > r.top + r.height / 2 });
                }}
                onDrop={(e) => { e.preventDefault(); finishDrop(); }}
                onDragEnd={() => { setDrag(null); setDrop(null); }}>
                <button className="fav-main" disabled={!resolved} onClick={() => openEntry(entry)} title={displayPath(entry.target)}>
                  <span className="fav-label">{labelOf(entry)}</span>
                  <small>{resolved ? kindHint(entry) : "Not found"}</small>
                </button>
                {!resolved
                  ? <button className="fav-remove always" onClick={() => void favorites.removeEntry(group.name, i)}>Remove</button>
                  : <button className="fav-remove" aria-label={`Remove ${labelOf(entry)} from favourites`} title="Remove from favourites" onClick={() => void favorites.removeEntry(group.name, i)}>×</button>}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function kindHint(entry: FavoriteEntry): string {
  if (entry.type === "folder") return "Folder";
  if (entry.type === "search") return "Saved search";
  if (entry.type === "heading") return "Heading";
  if (entry.type === "block") return "Block";
  const dir = entry.target.includes("/") ? entry.target.slice(0, entry.target.lastIndexOf("/")) : "";
  return dir || "Note";
}
