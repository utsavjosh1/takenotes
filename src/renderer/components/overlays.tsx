import { useEffect, useRef, type JSX } from "react";
import type { CtxMenu, Toast as ToastT } from "./types";
import { Icon } from "./icons";

export function ContextMenu({ menu, onClose }: { menu: NonNullable<CtxMenu>; onClose: () => void }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.focus();
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
    };
  }, [onClose]);
  const w = 240;
  const x = Math.min(menu.x, window.innerWidth - w - 8);
  const y = Math.min(menu.y, window.innerHeight - menu.items.length * 32 - 32);
  return (
    <div ref={ref} className="context-menu" role="menu" tabIndex={-1} style={{ left: x, top: Math.max(8, y) }}>
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
  tabs: { key: string; relativePath: string; dirty: boolean }[];
  activeKey: string | null;
  onActivate: (key: string) => void;
  onClose: (key: string) => void;
  onContext: (e: React.MouseEvent, key: string) => void;
  onReorder: (from: string, to: string) => void;
}): JSX.Element {
  const dragKey = useRef<string | null>(null);
  return (
    <div className="tabstrip" role="tablist" aria-label="Open notes">
      {tabs.map((t) => {
        const name = t.relativePath.replace(/\\/g, "/").split("/").pop() ?? t.relativePath;
        return (
          <div
            key={t.key}
            role="tab"
            aria-selected={t.key === activeKey}
            tabIndex={0}
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
            onKeyDown={(e) => { if (e.key === "Enter") onActivate(t.key); }}
          >
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
