import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { flattenGroups, paletteMove, type PaletteGroup } from "../overlays";
import { Kbd } from "./badges";

export type PaletteItem = {
  id: string;
  label: ReactNode;
  /** Second line: folder, group or a count. */
  description?: string;
  /** Shortcut on the right. */
  hint?: string;
  /** Small tag such as "recent" or "new". */
  tag?: string;
  /** Why this row cannot run. Shown instead of the description. */
  disabledReason?: string;
};
export type PaletteMode = { id: string; label: string; key: string; active: boolean };
export type PaletteSelect = { ctrl: boolean; shift: boolean };

export type CommandPaletteProps = {
  label: string;
  placeholder?: string;
  query: string;
  onQueryChange: (q: string) => void;
  groups: PaletteGroup<PaletteItem>[];
  onSelect: (item: PaletteItem, how: PaletteSelect) => void;
  onClose: () => void;
  modes?: PaletteMode[];
  onModeSelect?: (id: string) => void;
  /** Key hints in the footer, e.g. { keys: ["Enter"], text: "open" }. */
  hints?: Array<{ keys: string[]; text: string }>;
  emptyText?: string;
};

/** Input on top, grouped results, a footer of key hints. combobox + listbox:
 * focus stays in the input and the highlighted row is aria-activedescendant. */
export function CommandPalette({ label, placeholder, query, onQueryChange, groups, onSelect, onClose, modes, onModeSelect,
  hints = [], emptyText = "No matches." }: CommandPaletteProps) {
  const listId = useId();
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<Element | null>(typeof document === "undefined" ? null : document.activeElement);
  const flat = useMemo(() => flattenGroups(groups), [groups]);
  const active = Math.min(index, Math.max(0, flat.length - 1));
  const optionId = (i: number) => `${listId}-opt-${i}`;

  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    input.current?.focus();
    const back = opener.current;
    return () => { if (back instanceof HTMLElement && back.isConnected) back.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => { document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" }); });

  const commit = (i: number, how: PaletteSelect) => {
    const row = flat[i];
    if (!row || row.item.disabledReason) return;
    onSelect(row.item, how);
  };

  return <div className="ui-scrim ui-scrim--top" onMouseDown={onClose}>
    <div className="ui-palette" role="dialog" aria-modal="true" aria-label={label} onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } }}>
      <input ref={input} className="ui-palette-input" role="combobox" aria-label={label} aria-expanded={flat.length > 0}
        aria-controls={listId} aria-autocomplete="list" aria-activedescendant={flat.length > 0 ? optionId(active) : undefined}
        placeholder={placeholder} value={query} onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          const next = paletteMove(active, flat.length, e.key);
          if (next !== null) { e.preventDefault(); setIndex(next); return; }
          if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); commit(active, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey }); }
        }} />
      {modes && modes.length > 0 && <div className="ui-palette-modes" role="group" aria-label="Search in">
        {modes.map((m) => <button key={m.id} type="button" tabIndex={-1} aria-pressed={m.active}
          className={`ui-palette-mode${m.active ? " is-on" : ""}`} onMouseDown={(e) => e.preventDefault()}
          onClick={() => onModeSelect?.(m.id)}><Kbd>{m.key}</Kbd>{m.label}</button>)}
      </div>}
      <div className="ui-palette-list" role="listbox" id={listId} aria-label="Results">
        {flat.length === 0 && <p className="ui-palette-empty" role="presentation">{emptyText}</p>}
        {flat.map((row, i) => <div key={row.item.id} role="presentation">
          {row.firstInGroup && row.heading && <div className="ui-palette-group" role="presentation">{row.heading}</div>}
          <div id={optionId(i)} role="option" aria-selected={i === active} aria-disabled={row.item.disabledReason ? true : undefined}
            className={`ui-palette-item${i === active ? " is-on" : ""}${row.item.disabledReason ? " is-disabled" : ""}`}
            onMouseEnter={() => setIndex(i)} onClick={(e) => commit(i, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })}>
            <span className="ui-palette-main">
              <span>{row.item.label}</span>
              {(row.item.disabledReason || row.item.description) && <small>{row.item.disabledReason ?? row.item.description}</small>}
            </span>
            {row.item.tag && <span className="ui-palette-tag">{row.item.tag}</span>}
            {row.item.hint && <Kbd>{row.item.hint}</Kbd>}
          </div>
        </div>)}
      </div>
      {hints.length > 0 && <div className="ui-palette-foot" aria-hidden="true">
        {hints.map((h) => <span key={h.text}>{h.keys.map((k) => <Kbd key={k}>{k}</Kbd>)} {h.text}</span>)}
      </div>}
    </div>
  </div>;
}
