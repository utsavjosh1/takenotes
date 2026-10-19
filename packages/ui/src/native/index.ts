// Native (React Native / Expo) entry. Re-exports only the platform-neutral
// modules: no DOM, no React DOM, no browser globals. Native controls map
// these tokens and behavior contracts to platform components; e.g. Button
// variant "primary" keeps the same blocked/pending/dismissal rules as DOM,
// with touch target sizes from `targetSize.touch`.
export { colors, space, radius, fontSize, lineHeight, targetSize, resolveTheme } from "../theme";
export type { Theme, ThemePreference, ColorToken } from "../theme";
export { actionState, canDismissDialog, fieldState } from "../behavior";
import type { NoticeTone } from "../behavior";
export type { ActionState, ButtonVariant, NoticeTone, Announcement, DialogPolicy, DismissReason, FieldState } from "../behavior";

/**
 * M1 — Native row/notice prop contracts (S4).
 *
 * Platform-neutral props only: no `react-native` import may ever appear in
 * this package. `apps/mobile/components/*` maps these contracts to RN
 * controls (touch targets from `targetSize.touch`, tones from `colors`).
 *
 * - `ListRowProps`: one explorer row (file or folder). `detail` is the
 *   secondary line (e.g. modified date); `dimmed` marks unresolved
 *   favorites (greyed + retained, re-resolves on create).
 * - `SearchRowProps`: one `SearchMatch` row. `line` 0 = metadata-only
 *   match (matched text is the preview); otherwise an honest file line.
 * - `NoticeProps`: one partial-index / conflict / error banner. Copy comes
 *   from `mobileIndexStatusMessage` or the `CONFLICT` flow — never invented
 *   in the component.
 * - `EmptyStateProps`: recents/empty lists. `actionLabel` + `onAction` stay
 *   paired (a button without a handler is a dead end on touch).
 */
export type ListRowProps = {
  title: string;
  detail?: string;
  kind: "file" | "folder";
  dimmed?: boolean;
  selected?: boolean;
  onPress: () => void;
};

export type SearchRowProps = {
  relativePath: string;
  line: number;
  column: number;
  preview: string;
  onPress: () => void;
};

export type NoticeProps = {
  tone: NoticeTone;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

export type EmptyStateProps = {
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
};
