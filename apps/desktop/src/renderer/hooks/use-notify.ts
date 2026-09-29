import { useCallback } from "react";
import { useToastStore } from "../stores/toasts";
import { friendlyError } from "../error-text";

export type Notify = {
  toast: (text: string, kind?: "info" | "error") => void;
  errToast: (error: { code: string; message: string }, prefix?: string) => void;
};

/** Distinct error toasts (P1-04): the headline names the failure kind so
 * PERMISSION_DENIED never reads as NOT_FOUND. Takes the structured
 * `{ code, message }` every IPC result carries. */
export function useNotify(): Notify {
  const push = useToastStore((s) => s.push);
  const toast = useCallback((text: string, kind: "info" | "error" = "info") => push(text, kind), [push]);
  const errToast = useCallback(
    (error: { code: string; message: string }, prefix?: string) => {
      const text = friendlyError(error.code, error.message);
      push(prefix ? `${prefix} — ${text}` : text, "error");
    },
    [push],
  );
  return { toast, errToast };
}
