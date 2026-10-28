// This entry point must stay platform-neutral. DOM code lives in ./dom.
export { colors, space, radius, fontSize, lineHeight, targetSize, resolveTheme, publicColors, publicRadius, layout, controlHeight, type, fonts, motion, easing, zIndex, parseHex, mixHex, contrastRatio, deriveAccent, accentReadable, MIN_ACCENT_CONTRAST } from "./theme";
export type { Theme, ThemePreference, ColorToken } from "./theme";
export { actionState, canDismissDialog, fieldState, moveRovingIndex } from "./behavior";
export type { ActionState, ButtonVariant, NoticeTone, Announcement, DialogPolicy, DismissReason, FieldState, RovingOrientation } from "./behavior";

export { cn } from "./cn";

export type UiDensity = "comfortable" | "compact";
export const TAKENOTES_UI_PACKAGE = "@takenotes/ui";
