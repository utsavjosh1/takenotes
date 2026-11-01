import type { JSX } from "react";
import { Menu, Tabs, type MenuItemDef } from "@takenotes/ui/dom";
import type { CtxMenu } from "./types";

/** Right-click and "more" menus. Rows with the label "---" are separators.
 * The shared Menu owns keys, typeahead, focus return and placement. */
export function ContextMenu({ menu, onClose }: { menu: NonNullable<CtxMenu>; onClose: () => void }): JSX.Element {
  const items: MenuItemDef[] = menu.items.map((it, i) => it.label === "---"
    ? { id: String(i), label: "", separator: true }
    : { id: String(i), label: it.label, ...(it.shortcut ? { hint: it.shortcut } : {}), ...(it.danger ? { danger: true } : {}), ...(it.disabled ? { disabled: true } : {}) });
  return <Menu label="Actions" anchor={{ x: menu.x, y: menu.y }} items={items} onClose={onClose}
    onSelect={(id) => menu.items[Number(id)]?.run()} />;
}

const noteName = (relativePath: string): string => (relativePath.replace(/\\/g, "/").split("/").pop() ?? relativePath).replace(/\.md$/i, "");

export function TabStrip({ tabs, activeKey, onActivate, onClose, onContext, onReorder }: {
  tabs: { key: string; relativePath: string; dirty: boolean; pinned?: boolean }[];
  activeKey: string | null;
  onActivate: (key: string) => void;
  onClose: (key: string) => void;
  onContext: (e: React.MouseEvent, key: string) => void;
  onReorder: (from: string, to: string) => void;
}): JSX.Element {
  return <Tabs label="Open notes" activeId={activeKey} onActivate={onActivate} onClose={onClose} onContext={onContext} onReorder={onReorder}
    tabs={tabs.map((t) => ({ id: t.key, label: noteName(t.relativePath), dirty: t.dirty, ...(t.pinned ? { pinned: true } : {}) }))} />;
}
