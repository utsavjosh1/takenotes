import { useCallback } from "react";
import { useToast } from "@takenotes/ui/dom";
import { friendlyError } from "../error-text";
import type { ToastAction } from "../components/types";

export type Notify = {
  toast: (text: string, kind?: "info" | "error", action?: ToastAction) => void;
  errToast: (error: { code: string; message: string }, prefix?: string) => void;
};

/** Distinct error toasts (P1-04): the headline names the failure kind so
 * PERMISSION_DENIED never reads as NOT_FOUND. Takes the structured
 * `{ code, message }` every IPC result carries. */
export function useNotify(): Notify {
  const { show } = useToast();
  const toast = useCallback(
    (text: string, kind: "info" | "error" = "info", action?: ToastAction) => show(text, { kind, ...(action ? { undo: action } : {}) }),
    [show],
  );
  const errToast = useCallback(
    (error: { code: string; message: string }, prefix?: string) => {
      const text = friendlyError(error.code, error.message);
      show(prefix ? `${prefix} — ${text}` : text, { kind: "error" });
    },
    [show],
  );
  return { toast, errToast };
}
