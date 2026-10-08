// This entry point must stay platform-neutral. DOM code lives in ./dom.
export { colors, space, radius, fontSize, lineHeight, targetSize, resolveTheme } from "./theme";
export type { Theme, ThemePreference, ColorToken } from "./theme";
export { actionState, canDismissDialog, fieldState, moveRovingIndex } from "./behavior";
export type { ActionState, ButtonVariant, NoticeTone, Announcement, DialogPolicy, DismissReason, FieldState, RovingOrientation } from "./behavior";

export type UiDensity = "comfortable" | "compact";
export const TAKENOTES_UI_PACKAGE = "@takenotes/ui";
