/** Shared interaction rules; platform adapters map them to DOM/native events.
 * These rules never perform an operation or infer that it succeeded. */
export type ButtonVariant = "primary" | "secondary" | "quiet" | "destructive";
export type NoticeTone = "info" | "success" | "warning" | "danger";
export type Announcement = "off" | "polite" | "assertive";

export type ActionState = { disabled?: boolean; pending?: boolean };
export function actionState({ disabled = false, pending = false }: ActionState) {
  return { blocked: disabled || pending, busy: pending };
}

export type DismissReason = "close" | "escape" | "backdrop";
export type DialogPolicy = { dismissible?: boolean; closeOnBackdrop?: boolean };
export function canDismissDialog(reason: DismissReason, { dismissible = true, closeOnBackdrop = false }: DialogPolicy): boolean {
  return dismissible && (reason !== "backdrop" || closeOnBackdrop);
}

export type FieldState = { description?: string; error?: string };
export function fieldState({ description, error }: FieldState) {
  return { invalid: Boolean(error), description, error: error || undefined };
}
