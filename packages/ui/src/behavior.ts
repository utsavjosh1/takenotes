/** Shared interaction rules; platform adapters map them to DOM/native events.
 * These rules never perform an operation or infer that it succeeded. */
/** `secondary`, `quiet` and `destructive` are deprecated aliases of
 * `default`, `ghost` and `danger`; they keep old callers working until M4. */
export type ButtonVariant = "default" | "primary" | "ghost" | "danger" | "secondary" | "quiet" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";
const VARIANT_ALIAS = { secondary: "default", quiet: "ghost", destructive: "danger" } as const;
export function canonicalVariant(v: ButtonVariant): "default" | "primary" | "ghost" | "danger" {
  return v in VARIANT_ALIAS ? VARIANT_ALIAS[v as keyof typeof VARIANT_ALIAS] : (v as "default" | "primary" | "ghost" | "danger");
}
export type NoticeTone = "info" | "success" | "warning" | "danger";
export type Announcement = "off" | "polite" | "assertive";

export type ActionState = { disabled?: boolean; pending?: boolean };
export function actionState({ disabled = false, pending = false }: ActionState) {
  return { blocked: disabled || pending, busy: pending };
}

export type DismissReason = "close" | "escape" | "backdrop";
/** `unsavedInput`: the dialog holds typed text, so Escape and the backdrop
 * must not throw it away. The close button (an explicit act) still works. */
export type DialogPolicy = { dismissible?: boolean; closeOnBackdrop?: boolean; unsavedInput?: boolean };
export function canDismissDialog(reason: DismissReason, { dismissible = true, closeOnBackdrop = false, unsavedInput = false }: DialogPolicy): boolean {
  if (!dismissible) return false;
  if (reason === "backdrop") return closeOnBackdrop && !unsavedInput;
  if (reason === "escape") return !unsavedInput;
  return true;
}

export type FieldState = { description?: string; error?: string };
export function fieldState({ description, error }: FieldState) {
  return { invalid: Boolean(error), description, error: error || undefined };
}

/** Roving-tabindex navigation (Step 9, slice 6c): one shared mapping for
 * settings tablists, tab strips, and menus. Arrow keys move with wrap,
 * Home/End jump; anything else returns null so callers keep native
 * behavior (Enter/Space/Delete stay in the component). Orientation only
 * decides which arrows apply — Home/End work in both. */
export type RovingOrientation = "horizontal" | "vertical" | "both";
export function moveRovingIndex(
  current: number,
  count: number,
  key: string,
  orientation: RovingOrientation = "both",
): number | null {
  if (!Number.isInteger(current) || !Number.isInteger(count) || count <= 0) return null;
  const at = Math.min(Math.max(0, current), count - 1);
  const forward = key === "ArrowRight" || key === "ArrowDown";
  const backward = key === "ArrowLeft" || key === "ArrowUp";
  const horizontal = key === "ArrowRight" || key === "ArrowLeft";
  const vertical = key === "ArrowDown" || key === "ArrowUp";
  if (orientation === "horizontal" && vertical) return null;
  if (orientation === "vertical" && horizontal) return null;
  if (forward) return (at + 1) % count;
  if (backward) return (at - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}
