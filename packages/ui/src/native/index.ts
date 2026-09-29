// Native (React Native / Expo) entry. Re-exports only the platform-neutral
// modules: no DOM, no React DOM, no browser globals. Native controls map
// these tokens and behavior contracts to platform components; e.g. Button
// variant "primary" keeps the same blocked/pending/dismissal rules as DOM,
// with touch target sizes from `targetSize.touch`.
export { colors, space, radius, fontSize, lineHeight, targetSize, resolveTheme } from "../theme";
export type { Theme, ThemePreference, ColorToken } from "../theme";
export { actionState, canDismissDialog, fieldState } from "../behavior";
export type { ActionState, ButtonVariant, NoticeTone, Announcement, DialogPolicy, DismissReason, FieldState } from "../behavior";
