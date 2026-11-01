import type { MouseEvent, ReactNode } from "react";
import { saveStatus, type DocState } from "../overlays";
import { Pill } from "./badges";
import { Icon, type IconName } from "./icon";

export type TreeRowProps = {
  label: string;
  depth?: number;
  /** Present on folders: shows a chevron and sets aria-expanded. */
  expanded?: boolean;
  folder?: boolean;
  /** Item count, right aligned. */
  count?: number;
  active?: boolean;
  selected?: boolean;
  dropTarget?: boolean;
  onClick?: (e: MouseEvent) => void;
  onToggle?: () => void;
  onContextMenu?: (e: MouseEvent) => void;
  tabIndex?: number;
};
/** 28px row, 14px per level, no file or folder icons. */
export function TreeRow({ label, depth = 0, expanded, folder = false, count, active, selected, dropTarget, onClick, onToggle,
  onContextMenu, tabIndex = -1 }: TreeRowProps) {
  return <div role="treeitem" aria-level={depth + 1} aria-expanded={folder ? Boolean(expanded) : undefined}
    aria-selected={active ?? selected ?? false} tabIndex={tabIndex} style={{ "--d": depth } as React.CSSProperties}
    className={`ui-row${folder ? " ui-row--folder" : ""}${active ? " is-active" : ""}${selected ? " is-selected" : ""}${dropTarget ? " is-drop" : ""}`}
    onClick={(e) => { if (folder) onToggle?.(); onClick?.(e); }} onContextMenu={onContextMenu}
    onKeyDown={(e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (folder) onToggle?.(); onClick?.(e as unknown as MouseEvent); }
      else if (folder && ((e.key === "ArrowRight" && !expanded) || (e.key === "ArrowLeft" && expanded))) { e.preventDefault(); onToggle?.(); }
    }}>
    {folder ? <Icon name="chevR" size="xs" className={`ui-row-chev${expanded ? " is-open" : ""}`} /> : <span className="ui-row-chev" aria-hidden="true" />}
    <span className="ui-row-name">{label}</span>
    {count !== undefined && <span className="ui-row-count">{count}</span>}
  </div>;
}

export type RailItem = { id: string; label: string; icon: IconName; active?: boolean; hint?: string; onSelect: () => void };
/** 48px column of 36px icon buttons with a 2px accent bar on the active one. */
export function Rail({ items, footer = [], label = "Activity" }: { items: RailItem[]; footer?: RailItem[]; label?: string }) {
  const btn = (it: RailItem) => <button key={it.id} type="button" className={`ui-rail-btn${it.active ? " is-on" : ""}`}
    aria-label={it.label} aria-current={it.active ? "page" : undefined} title={it.hint ? `${it.label} (${it.hint})` : it.label}
    onClick={it.onSelect}><Icon name={it.icon} /></button>;
  return <nav className="ui-rail" aria-label={label}>{items.map(btn)}<span className="ui-rail-gap" />{footer.map(btn)}</nav>;
}

/** 40px bar. Keep to three small icon buttons in `end`. */
export function TitleBar({ start, center, end }: { start?: ReactNode; center?: ReactNode; end?: ReactNode }) {
  return <header className="ui-titlebar" role="banner">
    <div className="ui-titlebar-start">{start}</div><div className="ui-titlebar-center">{center}</div><div className="ui-titlebar-end">{end}</div>
  </header>;
}

/** 26px bar: connection, save state, counts. Counts that change per keystroke
 * must not be live regions, so only SaveStatePill announces. */
export function StatusBar({ start, end }: { start?: ReactNode; end?: ReactNode }) {
  return <footer className="ui-statusbar"><div className="ui-statusbar-start">{start}</div><div className="ui-statusbar-end">{end}</div></footer>;
}

/** Save state in words. Typing (dirty) is silent; a finished or failed save is announced. */
export function SaveStatePill({ state }: { state: DocState }) {
  const s = saveStatus(state);
  return <Pill tone={s.tone} dot role={s.announce === "assertive" ? "alert" : s.announce === "polite" ? "status" : undefined}>{s.label}</Pill>;
}
