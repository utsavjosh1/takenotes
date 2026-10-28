import { useId, useRef, type KeyboardEvent } from "react";
import { menuMove, typeaheadAppend, typeaheadFind, type TypeaheadState } from "../overlays";
import { Icon, type IconName } from "./icon";
import { Kbd } from "./badges";
import { useOverlay, type Anchor } from "./use-overlay";

export type MenuItemDef = {
  id: string;
  label: string;
  icon?: IconName;
  /** Shortcut shown on the right. */
  hint?: string;
  danger?: boolean;
  /** A string is the reason shown under the label. `true` disables with no reason (avoid). */
  disabled?: string | boolean;
  separator?: boolean;
};

export type MenuItemProps = {
  item: MenuItemDef;
  onSelect: (id: string) => void;
  tabIndex: number;
  index: number;
};

/** One row. Disabled rows stay focusable (aria-disabled) so the reason can be read. */
export function MenuItem({ item, onSelect, tabIndex, index }: MenuItemProps) {
  const reasonId = useId();
  const reason = typeof item.disabled === "string" ? item.disabled : undefined;
  const blocked = Boolean(item.disabled);
  return <button type="button" role="menuitem" tabIndex={tabIndex} data-index={index}
    className={`ui-mi${item.danger ? " ui-mi--danger" : ""}`} aria-disabled={blocked || undefined}
    aria-describedby={reason ? reasonId : undefined}
    onClick={() => { if (!blocked) onSelect(item.id); }}>
    {item.icon ? <Icon name={item.icon} size="sm" /> : <span className="ui-mi-icon" aria-hidden="true" />}
    <span className="ui-mi-label">
      <span>{item.label}</span>
      {reason && <small id={reasonId}>{reason}</small>}
    </span>
    {item.hint && <Kbd>{item.hint}</Kbd>}
  </button>;
}

export type MenuProps = {
  items: MenuItemDef[];
  /** Screen point (context menu) or the element's rect (button menu). */
  anchor: Anchor;
  label: string;
  onSelect: (id: string) => void;
  onClose: () => void;
};

/** Arrow keys, Home/End, typeahead, Escape. Focus lands on the first enabled
 * item and returns to the opener on close. Selecting closes the menu. */
export function Menu({ items, anchor, label, onSelect, onClose }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const type = useRef<TypeaheadState>({ buffer: "", at: 0 });
  const firstEnabled = items.findIndex((i) => !i.separator && !i.disabled);
  const { style } = useOverlay(ref, { anchor, onClose, focusFirst: `[data-index="${Math.max(0, firstEnabled)}"]` });

  const focusAt = (i: number) => ref.current?.querySelector<HTMLElement>(`[data-index="${i}"]`)?.focus();
  const current = () => Number((document.activeElement as HTMLElement | null)?.dataset.index ?? -1);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Tab") { onClose(); return; }
    const move = menuMove(items, current(), e.key);
    if (move !== null) { e.preventDefault(); focusAt(move); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const next = typeaheadAppend(type.current, e.key, Date.now());
    if (!next) return;
    type.current = next;
    const hit = typeaheadFind(items, current(), next.buffer);
    if (hit !== null) { e.preventDefault(); focusAt(hit); }
  };

  const select = (id: string) => { onClose(); onSelect(id); };
  return <div ref={ref} role="menu" aria-label={label} tabIndex={-1} className="ui-menu" style={style} onKeyDown={onKeyDown}>
    {items.map((it, i) => it.separator
      ? <hr key={it.id} role="separator" className="ui-menu-sep" />
      : <MenuItem key={it.id} item={it} index={i} tabIndex={i === Math.max(0, firstEnabled) ? 0 : -1} onSelect={select} />)}
  </div>;
}
