import { useMemo, useState, type JSX } from "react";
import { Dialog } from "@takenotes/ui/dom";
import { listNoteTemplates } from "@takenotes/core/productivity/templates";
import { displayPath } from "./types";

/** Template picker (productivity step 1): lists `.md` files under the
 * configured template folder. Selection loads + renders upstream; this
 * dialog only reports the chosen relative path. */
export function TemplatePicker({ allPaths, templateFolder, onPick, onClose }: {
  allPaths: string[];
  templateFolder: string;
  onPick: (relativePath: string) => void;
  onClose: () => void;
}): JSX.Element {
  const [query, setQuery] = useState("");
  const templates = useMemo(() => listNoteTemplates(allPaths, templateFolder), [allPaths, templateFolder]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => t.toLowerCase().includes(q));
  }, [templates, query]);
  return (
    <Dialog title="Insert Template" onClose={onClose} closeOnBackdrop>
      <input
        className="cmd-input"
        autoFocus
        aria-label="Filter templates"
        placeholder={templates.length === 0 ? `No .md files in ${templateFolder || "(no folder set)"}.` : "Filter templates…"}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="cmd-list" role="listbox" aria-label="Templates">
        {filtered.length === 0 && <div className="cmd-section">No matching templates.</div>}
        {filtered.map((t) => (
          <div
            key={t}
            role="option"
            aria-selected={false}
            className="cmd-item"
            onClick={() => onPick(t)}
          >
            <span className="main-label">{displayPath(t)}</span>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
