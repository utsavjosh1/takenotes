import { useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type KeyboardEvent } from "react";
import { splitOverflow, tabMove } from "../overlays";
import { Icon } from "./icon";
import { Menu } from "./menu";

export type TabDef = { id: string; label: string; dirty?: boolean; pinned?: boolean; conflict?: boolean };
export type TabsProps = {
  tabs: TabDef[];
  activeId: string | null;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onContext?: (e: MouseEvent, id: string) => void;
  label?: string;
};
const GUESS = 140;
const MORE = 40;

/** 36px strip, 32px tabs, accent line on the active one. Arrows move and open
 * the tab, Delete or middle-click closes. Tabs that do not fit go into a menu;
 * the active tab always stays in the strip. */
export function Tabs({ tabs, activeId, onActivate, onClose, onContext, label = "Open notes" }: TabsProps) {
  const strip = useRef<HTMLDivElement>(null);
  const widths = useRef(new Map<string, number>());
  const [available, setAvailable] = useState(Infinity);
  const [menu, setMenu] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [, bump] = useState(0);
  const activeIndex = Math.max(0, tabs.findIndex((t) => t.id === activeId));

  useLayoutEffect(() => {
    const el = strip.current;
    if (!el) return;
    let changed = false;
    el.querySelectorAll<HTMLElement>("[data-tab-id]").forEach((node) => {
      const w = node.getBoundingClientRect().width;
      if (w && widths.current.get(node.dataset.tabId!) !== w) { widths.current.set(node.dataset.tabId!, w); changed = true; }
    });
    const measure = () => setAvailable(el.clientWidth - 12);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (changed) bump((n) => n + 1);
    return () => ro.disconnect();
  });

  const { visible, hidden } = useMemo(
    () => splitOverflow(tabs.map((t) => widths.current.get(t.id) ?? GUESS), activeIndex, available, MORE),
    // widths is a ref read on purpose; bump() re-runs this after measuring.
    [tabs, activeIndex, available, widths.current.size],
  );

  const focusTab = (id: string) => strip.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(id)}"]`)?.focus();
  const onKey = (e: KeyboardEvent, t: TabDef) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onActivate(t.id); return; }
    if (e.key === "Delete") { e.preventDefault(); onClose(t.id); return; }
    const order = visible.map((i) => tabs[i]!.id);
    const next = tabMove(order.length, order.indexOf(t.id), e.key);
    if (next === null) return;
    e.preventDefault();
    onActivate(order[next]!);
    focusTab(order[next]!);
  };

  return <div className="ui-tabs">
    <div ref={strip} className="ui-tabs-list" role="tablist" aria-label={label}>
      {visible.map((i) => {
        const t = tabs[i]!;
        const on = t.id === activeId;
        const state = [t.dirty && "unsaved changes", t.conflict && "changed on disk", t.pinned && "pinned"].filter(Boolean).join(", ");
        return <div key={t.id} data-tab-id={t.id} role="tab" aria-selected={on} tabIndex={on || (activeId === null && i === 0) ? 0 : -1}
          aria-label={state ? `${t.label}, ${state}` : t.label} title={t.label}
          className={`ui-tab${on ? " is-on" : ""}`} onClick={() => onActivate(t.id)}
          onContextMenu={onContext && ((e) => onContext(e, t.id))}
          onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onClose(t.id); } }}
          onKeyDown={(e) => onKey(e, t)}>
          {t.pinned && <Icon name="pin" size="xs" />}
          <span className="ui-tab-label">{t.label}</span>
          {t.conflict && <Icon name="warn" size="xs" className="ui-tab-conflict" />}
          {t.dirty && <span className="ui-tab-dirty" aria-hidden="true" />}
          <button type="button" tabIndex={-1} className="ui-tab-close" aria-label={`Close ${t.label}`}
            onClick={(e) => { e.stopPropagation(); onClose(t.id); }}><Icon name="x" size="xs" /></button>
        </div>;
      })}
    </div>
    {hidden.length > 0 && <button type="button" className="ui-tab-more" aria-haspopup="menu" aria-label={`${hidden.length} more tabs`}
      onClick={(e) => setMenu(e.currentTarget.getBoundingClientRect())}>
      <Icon name="chevD" size="sm" />{hidden.length}
    </button>}
    {menu && <Menu label="More tabs" anchor={menu} onClose={() => setMenu(null)} onSelect={onActivate}
      items={hidden.map((i) => ({ id: tabs[i]!.id, label: tabs[i]!.dirty ? `${tabs[i]!.label} (unsaved)` : tabs[i]!.label }))} />}
  </div>;
}
