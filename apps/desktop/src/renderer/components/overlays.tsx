import { useEffect, useRef, type JSX } from "react";
import { moveRovingIndex } from "@takenotes/ui";
import type { CtxMenu, Toast as ToastT } from "./types";
import { Icon } from "./icons";

export function ContextMenu({ menu, onClose }: { menu: NonNullable<CtxMenu>; onClose: () => void }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  // Focus returns to the opener on close — the same contract as Dialog,
  // so right-click → Escape never strands keyboard users on <body>.
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    opener.current = document.activeElement;
    const el = ref.current;
    // APG menu keyboard: focus lands on the first enabled item; arrows
    // move between items (below), Tab still walks them as buttons.
    el?.querySelector<HTMLElement>(".ctx-item:not(:disabled)")?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    const onClick = (e: MouseEvent): void => {
      if (el && !el.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onClick, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onClick, true);
      const back = opener.current;
      if (back instanceof HTMLElement && back.isConnected) back.focus({ preventScroll: true });
    };
  }, [onClose]);
  const moveItemFocus = (e: React.KeyboardEvent): void => {
    const el = ref.current;
    if (!el) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>(".ctx-item:not(:disabled)"));
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = moveRovingIndex(current < 0 ? 0 : current, items.length, e.key, "vertical");
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    items[next]?.focus();
  };
  const w = 240;
  const x = Math.min(menu.x, window.innerWidth - w - 8);
  const y = Math.min(menu.y, window.innerHeight - menu.items.length * 32 - 32);
  return (
    <div ref={ref} className="context-menu" role="menu" aria-label="Actions" tabIndex={-1} style={{ left: x, top: Math.max(8, y) }} onKeyDown={moveItemFocus}>
      {menu.items.map((it, i) =>
        it.label === "---" ? (
          <div key={i} className="ctx-sep" />
        ) : (
          <button key={i} role="menuitem" className={`ctx-item${it.danger ? " danger" : ""}`} disabled={it.disabled} onClick={() => { onClose(); it.run(); }}>
            <span>{it.label}</span>
            {it.shortcut && <span className="sc">{it.shortcut}</span>}
          </button>
        ),
      )}
    </div>
  );
}

export function Toasts({ toasts, onDismiss }: { toasts: ToastT[]; onDismiss: (id: number) => void }): JSX.Element {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast${t.kind === "error" ? " error" : ""}`} role={t.kind === "error" ? "alert" : "status"}>
          {t.kind === "error" && <Icon name="alert" />}
          <span style={{ flex: 1 }}>{t.text}</span>
          <button className="link" onClick={() => onDismiss(t.id)} aria-label="Dismiss">Dismiss</button>
        </div>
      ))}
    </div>
  );
}

export function TabStrip({
  tabs,
  activeKey,
  onActivate,
  onClose,
  onContext,
  onReorder,
}: {
  tabs: { key: string; relativePath: string; dirty: boolean; pinned?: boolean }[];
  activeKey: string | null;
  onActivate: (key: string) => void;
  onClose: (key: string) => void;
  onContext: (e: React.MouseEvent, key: string) => void;
  onReorder: (from: string, to: string) => void;
}): JSX.Element {
  const dragKey = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const focusTab = (key: string): void => {
    listRef.current?.querySelector<HTMLElement>(`[data-tab-key="${CSS.escape(key)}"]`)?.focus();
  };
  return (
    <div ref={listRef} className="tabstrip" role="tablist" aria-label="Open notes">
      {tabs.map((t) => {
        const name = t.relativePath.replace(/\\/g, "/").split("/").pop() ?? t.relativePath;
        const state = `${name}${t.dirty ? ", unsaved changes" : ""}${t.pinned ? ", pinned" : ""}`;
        return (
          <div
            key={t.key}
            data-tab-key={t.key}
            role="tab"
            aria-selected={t.key === activeKey}
            aria-label={state}
            tabIndex={t.key === activeKey || (activeKey === null && tabs[0]?.key === t.key) ? 0 : -1}
            title={t.dirty ? `${name} — Unsaved changes` : name}
            className={`tab${t.key === activeKey ? " active" : ""}`}
            draggable
            onDragStart={() => { dragKey.current = t.key; }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragKey.current && dragKey.current !== t.key) onReorder(dragKey.current, t.key);
              dragKey.current = null;
            }}
            onClick={() => onActivate(t.key)}
            onContextMenu={(e) => onContext(e, t.key)}
            onAuxClick={(e) => { if (e.button === 1) onClose(t.key); }}
            onKeyDown={(e) => {
              // Step 9 tabs pattern: roving tabindex with automatic
              // activation on arrows/Home/End, Enter/Space re-asserts,
              // Delete closes. Shared mapping with settings + menus.
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onActivate(t.key); return; }
              if (e.key === "Delete") { e.preventDefault(); onClose(t.key); return; }
              const order = tabs.map((x) => x.key);
              const next = moveRovingIndex(order.indexOf(t.key), order.length, e.key, "horizontal");
              if (next === null) return;
              e.preventDefault();
              const nextKey = order[next]!;
              onActivate(nextKey);
              focusTab(nextKey);
            }}
          >
            {t.pinned && <span className="pin-dot" aria-label="Pinned tab">◆</span>}
            <span className="t-label">{name}</span>
            {t.dirty && <span className="dirty-dot" aria-label="Unsaved changes">●</span>}
            <button
              className="t-close"
              tabIndex={-1}
              aria-label={`Close ${name}`}
              onClick={(e) => { e.stopPropagation(); onClose(t.key); }}
            >
              <Icon name="x" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
