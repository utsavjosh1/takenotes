import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { emptyToasts, toastReducer, TOAST_MS, type ToastKind, type ToastState } from "../overlays";
import { Icon } from "./icon";

export type ToastOptions = {
  kind?: ToastKind;
  /** A real undo: `run` must restore the previous state. */
  undo?: { label?: string; run: () => void };
};
type ToastApi = { show: (text: string, options?: ToastOptions) => void };

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast needs a ToastProvider above it.");
  return api;
}

/** Bottom-right, one at a time, 4 seconds (paused while hovered or focused).
 * Errors are red and announced as alerts. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const store = useRef<ToastState>(emptyToasts);
  const undos = useRef(new Map<number, () => void>());
  const [state, setState] = useState<ToastState>(emptyToasts);
  const [paused, setPaused] = useState(false);

  const end = useCallback((id: number) => {
    undos.current.delete(id);
    store.current = toastReducer(store.current, { type: "end", id });
    setState(store.current);
  }, []);

  const show = useCallback((text: string, options: ToastOptions = {}) => {
    const id = store.current.nextId;
    if (options.undo) undos.current.set(id, options.undo.run);
    store.current = toastReducer(store.current, {
      type: "push", text, ...(options.kind ? { kind: options.kind } : {}),
      ...(options.undo ? { undoLabel: options.undo.label ?? "Undo" } : {}),
    });
    setState(store.current);
  }, []);

  const current = state.current;
  useEffect(() => {
    if (!current || paused) return;
    const t = setTimeout(() => end(current.id), TOAST_MS);
    return () => clearTimeout(t);
  }, [current, paused, end]);

  const api = useMemo(() => ({ show }), [show]);
  return <ToastContext.Provider value={api}>
    {children}
    <div className="ui-toasts">
      {current && <div key={current.id} className={`ui-toast${current.kind === "error" ? " ui-toast--error" : ""}`}
        role={current.kind === "error" ? "alert" : "status"}
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
        {current.kind === "error" && <Icon name="warn" size="sm" />}
        <span>{current.text}</span>
        {current.undoLabel && <button type="button" className="ui-toast-undo" onClick={() => {
          const run = undos.current.get(current.id);
          end(current.id);
          run?.();
        }}>{current.undoLabel}</button>}
      </div>}
    </div>
  </ToastContext.Provider>;
}
