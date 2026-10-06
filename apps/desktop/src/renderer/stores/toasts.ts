import { create } from "zustand";
import type { Toast } from "../components/types";

let toastId = 1;

type ToastStore = {
  toasts: Toast[];
  push: (text: string, kind?: Toast["kind"]) => void;
  dismiss: (id: number) => void;
};

/** Transient notifications. Info toasts auto-dismiss after 5s; errors stay
 * until dismissed — same behavior as the previous `useState` version, now
 * pushable from any component without prop threading. */
export const useToastStore = create<ToastStore>()((set) => ({
  toasts: [],
  push: (text, kind = "info") => {
    const id = toastId++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }));
    if (kind === "info") {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      }, 5000);
    }
  },
  dismiss: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));
