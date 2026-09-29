/**
 * Step 2 Favorites pane: groups + ordered entries over `.takenotes/favorites.yaml`.
 * Unresolved targets render muted but retained (same rule as links-to-nonexistent).
 * Editing is inline (rename-row pattern); only group delete confirms.
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
  if (entry.type === "search") return `Search: ${entry.target}`;
  if (entry.type === "file" || entry.type === "folder") return fileName(entry.target);
  const split = splitAnchorTarget(entry.target);
  return split ? `${fileName(split.rel)}#${split.frag}` : entry.target;
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

const NEW_TYPES: FavoriteEntry["type"][] = ["file", "folder", "search", "heading", "block"];

const TARGET_HINT: Record<FavoriteEntry["type"], string> = {
  file: "path/to/Note.md",
  folder: "path/to/folder",
  search: "search query",
  heading: "Note.md#Heading",
  block: "Note.md#^id",
};

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
  const [newGroup, setNewGroup] = useState("");
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [aliasEditor, setAliasEditor] = useState<{ group: string; index: number } | null>(null);
  const [aliasDraft, setAliasDraft] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { target: string; type: FavoriteEntry["type"] }>>({});

  if (favorites.loading) {
    return (
      <div className="pane-placeholder">
        <p className="panel-title">Favorites</p>
        <p>Loading…</p>
      </div>
    );
  }
  if (favorites.loadError) {
    return (
      <div className="pane-placeholder">
        <p className="panel-title">Favorites</p>
        <p>Couldn&apos;t load favorites.</p>
        <p className="inline-error">{favorites.loadError}</p>
        <Button onClick={() => void favorites.reload()}>Retry</Button>
      </div>
    );
  }

  const commitAlias = (): void => {
    if (!aliasEditor) return;
    void favorites.setAlias(aliasEditor.group, aliasEditor.index, aliasDraft.trim() ? aliasDraft : null);
    setAliasEditor(null);
  };

  const commitGroupRename = (oldName: string): void => {
    if (renameDraft.trim() && renameDraft.trim() !== oldName) void favorites.renameGroup(oldName, renameDraft.trim());
    setRenamingGroup(null);
  };

  return (
    <div>
      {doc.groups.map((group) => {
        const draft = drafts[group.name] ?? { target: "", type: "file" as const };
        const setDraft = (patch: Partial<typeof draft>): void =>
          setDrafts((d) => ({ ...d, [group.name]: { ...draft, ...patch } }));
        return (
          <section key={group.name} aria-label={`Favorites group ${group.name}`}>
            <div className="panel-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {renamingGroup === group.name ? (
                <input
                  className="rename-input"
                  autoFocus
                  aria-label="Rename group"
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitGroupRename(group.name);
                    else if (e.key === "Escape") setRenamingGroup(null);
                    e.stopPropagation();
                  }}
                  onBlur={() => commitGroupRename(group.name)}
                />
              ) : (
                <span>{group.name}</span>
              )}
              <span className="row-actions" style={{ display: "inline-flex" }}>
                <Button variant="quiet" onClick={() => { setRenamingGroup(group.name); setRenameDraft(group.name); }}>Rename</Button>
                {doc.groups.length > 1 && (
                  <Button
                    variant="quiet"
                    onClick={() => {
                      if (window.confirm(`Delete group "${group.name}"? Entries are removed from favorites (files untouched).`)) {
                        void favorites.deleteGroup(group.name);
                      }
                    }}
                  >
                    Delete
                  </Button>
                )}
              </span>
            </div>
            {group.entries.map((entry, i) => {
              const resolved = isFavoriteResolved(entry, files, dirs);
              const editingThisAlias = aliasEditor?.group === group.name && aliasEditor.index === i;
              return (
                <div key={`${entry.type}:${entry.target}`} className="tree-row" style={{ paddingLeft: 12 }} title={displayPath(entry.target)}>
                  {editingThisAlias ? (
                    <input
                      className="rename-input"
                      autoFocus
                      aria-label={`Alias for ${labelOf(entry)}`}
                      placeholder="Alias (empty clears)"
                      value={aliasDraft}
                      onChange={(e) => setAliasDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitAlias();
                        else if (e.key === "Escape") setAliasEditor(null);
                        e.stopPropagation();
                      }}
                      onBlur={commitAlias}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <button
                      className={`row-label${resolved ? "" : " unresolved"}`}
                      title={resolved ? displayPath(entry.target) : `${displayPath(entry.target)} (target missing — kept)`}
                      onClick={() => {
                        if (entry.type === "file") open.openFile(entry.target);
                        else if (entry.type === "folder") open.revealDir(entry.target);
                        else if (entry.type === "search") open.runSearch(entry.target);
                        else {
                          const split = splitAnchorTarget(entry.target);
                          if (split) {
                            if (openAnchor) openAnchor(split.rel, split.frag, entry.type === "block");
                            else open.openFile(split.rel);
                          }
                        }
                      }}
                    >
                      {labelOf(entry)}
                      {!resolved && " (missing)"}
                    </button>
                  )}
                  <span className="row-actions">
                    <Button
                      variant="quiet"
                      title={i === 0 ? "Already first" : "Move up"}
                      onClick={() => void favorites.moveEntry(group.name, i, i - 1)}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="quiet"
                      title={i === group.entries.length - 1 ? "Already last" : "Move down"}
                      onClick={() => void favorites.moveEntry(group.name, i, i + 1)}
                    >
                      ↓
                    </Button>
                    <Button
                      variant="quiet"
                      title="Edit alias"
                      onClick={() => { setAliasEditor({ group: group.name, index: i }); setAliasDraft(entry.alias ?? ""); }}
                    >
                      Alias
                    </Button>
                    <Button variant="quiet" title="Remove from favorites" onClick={() => void favorites.removeEntry(group.name, i)}>
                      Remove
                    </Button>
                  </span>
                </div>
              );
            })}
            <div className="tree-row" style={{ paddingLeft: 12, gap: 4 }}>
              <select
                aria-label={`New favorite type in ${group.name}`}
                value={draft.type}
                onChange={(e) => setDraft({ type: e.target.value as FavoriteEntry["type"] })}
              >
                {NEW_TYPES.map((t) => <option key={t} value={t}>{t[0]!.toUpperCase() + t.slice(1)}</option>)}
              </select>
              <input
                className="rename-input"
                placeholder={TARGET_HINT[draft.type]}
                aria-label={`New favorite target in ${group.name}`}
                value={draft.target}
                onChange={(e) => setDraft({ target: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && draft.target.trim()) {
                    void favorites.addEntry(group.name, { type: draft.type, target: draft.target.trim() });
                    setDraft({ target: "" });
                  }
                  e.stopPropagation();
                }}
              />
              <Button
                variant="quiet"
                onClick={() => {
                  if (!draft.target.trim()) return;
                  void favorites.addEntry(group.name, { type: draft.type, target: draft.target.trim() });
                  setDraft({ target: "" });
                }}
              >
                Add
              </Button>
            </div>
          </section>
        );
      })}
      <div className="tree-row" style={{ paddingLeft: 12, gap: 4 }}>
        <input
          className="rename-input"
          placeholder="New group name"
          aria-label="New group name"
          value={newGroup}
          onChange={(e) => setNewGroup(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newGroup.trim()) { void favorites.addGroup(newGroup.trim()); setNewGroup(""); }
            e.stopPropagation();
          }}
        />
        <Button variant="quiet" onClick={() => { if (newGroup.trim()) { void favorites.addGroup(newGroup.trim()); setNewGroup(""); } }}>
          Add group
        </Button>
      </div>
    </div>
  );
}
