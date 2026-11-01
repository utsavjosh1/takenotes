/** Platform-neutral logic behind menus, popovers, toasts, tabs, the palette and
 * the status bar. Components only wire these to events and the DOM, so the
 * rules can be tested without a browser. */
import { moveRovingIndex } from "./behavior";

// ---- placement -----------------------------------------------------------

export type Rect = { left: number; top: number; width: number; height: number };
export type Size = { width: number; height: number };
export type Placement = "bottom-start" | "bottom-end" | "top-start" | "top-end" | "right-start";

/** Position an overlay next to an anchor. Flips to the other side when the
 * preferred side overflows and the other fits better, then clamps to the
 * viewport minus `margin`. A point anchor (context menu) has width/height 0. */
export function placeOverlay(
  anchor: Rect, size: Size, viewport: Size, placement: Placement = "bottom-start", gap = 4, margin = 8,
): { left: number; top: number; placement: Placement } {
  const below = anchor.top + anchor.height + gap;
  const above = anchor.top - size.height - gap;
  const wantsTop = placement.startsWith("top");
  const fitsBelow = below + size.height <= viewport.height - margin;
  const fitsAbove = above >= margin;
  const useTop = placement === "right-start" ? false : wantsTop ? (fitsAbove || !fitsBelow) : (!fitsBelow && fitsAbove);
  let top = placement === "right-start" ? anchor.top : useTop ? above : below;
  let left = placement === "right-start" ? anchor.left + anchor.width + gap
    : placement.endsWith("end") ? anchor.left + anchor.width - size.width : anchor.left;
  if (placement === "right-start" && left + size.width > viewport.width - margin) left = anchor.left - size.width - gap;
  left = Math.max(margin, Math.min(left, viewport.width - size.width - margin));
  top = Math.max(margin, Math.min(top, viewport.height - size.height - margin));
  const resolved: Placement = placement === "right-start" ? placement : `${useTop ? "top" : "bottom"}-${placement.endsWith("end") ? "end" : "start"}`;
  return { left, top, placement: resolved };
}

// ---- menu ----------------------------------------------------------------

export type MenuEntry = { label: string; separator?: boolean; disabled?: boolean | string };

/** Indices a person can move to. Separators are skipped; disabled items stay
 * reachable so their reason can be read. */
export function navigableIndices(items: MenuEntry[]): number[] {
  return items.flatMap((it, i) => (it.separator ? [] : [i]));
}

/** Next item index for an arrow/Home/End key, or null if the key is not ours. */
export function menuMove(items: MenuEntry[], current: number, key: string): number | null {
  const nav = navigableIndices(items);
  if (nav.length === 0) return null;
  const at = Math.max(0, nav.indexOf(current));
  const next = moveRovingIndex(at, nav.length, key, "vertical");
  return next === null ? null : nav[next]!;
}

export const TYPEAHEAD_MS = 700;
export type TypeaheadState = { buffer: string; at: number };

/** Add a printable key to the buffer, restarting if the last key was long ago. */
export function typeaheadAppend(state: TypeaheadState, key: string, now: number): TypeaheadState | null {
  if (key.length !== 1 || key === " " && state.buffer === "") return null;
  return { buffer: (now - state.at > TYPEAHEAD_MS ? "" : state.buffer) + key.toLowerCase(), at: now };
}

/** First item whose label starts with the buffer. Repeating one letter cycles
 * through matches after `current`; a longer buffer searches from `current`. */
export function typeaheadFind(items: MenuEntry[], current: number, buffer: string): number | null {
  if (!buffer) return null;
  const cycle = [...buffer].every((c) => c === buffer[0]);
  const needle = cycle ? buffer[0]! : buffer;
  const order = items.map((_, i) => i);
  const start = cycle ? current + 1 : Math.max(0, current);
  const rotated = [...order.slice(start), ...order.slice(0, start)];
  for (const i of rotated) {
    const it = items[i]!;
    if (!it.separator && it.label.toLowerCase().startsWith(needle)) return i;
  }
  return null;
}

// ---- toasts --------------------------------------------------------------

export const TOAST_MS = 4000;
export const TOAST_QUEUE_MAX = 5;
export type ToastKind = "info" | "error";
export type ToastItem = { id: number; text: string; kind: ToastKind; undoLabel?: string };
export type ToastState = { current: ToastItem | null; queue: ToastItem[]; nextId: number };
export type ToastAction =
  | { type: "push"; text: string; kind?: ToastKind; undoLabel?: string }
  | { type: "end"; id: number };

export const emptyToasts: ToastState = { current: null, queue: [], nextId: 1 };

/** One toast at a time. Later ones wait. An error is never stuck behind
 * information: it takes the screen unless the current toast offers Undo
 * (that choice must not vanish), in which case it goes first in the queue.
 * `end` covers expiry, dismissal and Undo alike. */
export function toastReducer(state: ToastState, action: ToastAction): ToastState {
  if (action.type === "end") {
    if (state.current?.id === action.id) {
      const [next, ...rest] = state.queue;
      return { ...state, current: next ?? null, queue: rest };
    }
    return { ...state, queue: state.queue.filter((t) => t.id !== action.id) };
  }
  const item: ToastItem = { id: state.nextId, text: action.text, kind: action.kind ?? "info", ...(action.undoLabel ? { undoLabel: action.undoLabel } : {}) };
  const nextId = state.nextId + 1;
  if (!state.current) return { ...state, current: item, nextId };
  if (item.kind === "error") {
    if (!state.current.undoLabel && state.current.kind !== "error") return { ...state, current: item, nextId };
    return { ...state, queue: [item, ...state.queue].slice(0, TOAST_QUEUE_MAX), nextId };
  }
  return { ...state, queue: [...state.queue, item].slice(0, TOAST_QUEUE_MAX), nextId };
}

// ---- tabs ----------------------------------------------------------------

/** Which tabs stay in the strip and which move into the overflow menu. The
 * active tab never hides. Others are kept nearest-to-active first. */
export function splitOverflow(
  widths: number[], activeIndex: number, available: number, moreWidth: number, gap = 2,
): { visible: number[]; hidden: number[] } {
  const all = widths.map((_, i) => i);
  const total = widths.reduce((a, w) => a + w, 0) + gap * Math.max(0, widths.length - 1);
  if (total <= available) return { visible: all, hidden: [] };
  const active = Math.min(Math.max(activeIndex, 0), widths.length - 1);
  let budget = available - moreWidth - gap;
  const keep = new Set<number>();
  if (active >= 0 && widths.length > 0) { keep.add(active); budget -= widths[active]! + gap; }
  const byDistance = all.filter((i) => i !== active).sort((a, b) => Math.abs(a - active) - Math.abs(b - active) || a - b);
  for (const i of byDistance) {
    if (widths[i]! + gap > budget) break;
    keep.add(i); budget -= widths[i]! + gap;
  }
  return { visible: all.filter((i) => keep.has(i)), hidden: all.filter((i) => !keep.has(i)) };
}

/** Tab to activate for a key (arrows wrap, Home/End), or null. */
export function tabMove(count: number, current: number, key: string): number | null {
  return moveRovingIndex(current, count, key, "horizontal");
}

// ---- command palette -----------------------------------------------------

/** Arrow keys clamp (no wrap) so holding Down stops at the last result. */
export function paletteMove(index: number, count: number, key: string): number | null {
  if (count <= 0) return null;
  if (key === "ArrowDown") return Math.min(index + 1, count - 1);
  if (key === "ArrowUp") return Math.max(index - 1, 0);
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

export type PaletteGroup<T> = { heading?: string; items: T[] };
/** Flat list in display order, remembering which group each row opens. */
export function flattenGroups<T>(groups: PaletteGroup<T>[]): Array<{ item: T; heading?: string; firstInGroup: boolean }> {
  return groups.flatMap((g) => g.items.map((item, i) => ({ item, ...(g.heading ? { heading: g.heading } : {}), firstInGroup: i === 0 })));
}

// ---- status bar ----------------------------------------------------------

export type DocState = "clean" | "dirty" | "saving" | "saved" | "conflict" | "error";
export type SaveStatus = { label: string; tone: "neutral" | "accent" | "ok" | "warn" | "bad"; announce: "off" | "polite" | "assertive" };

/** Words for the save state. Never says "Saved" unless the write finished. */
export function saveStatus(state: DocState): SaveStatus {
  switch (state) {
    case "clean": return { label: "No changes", tone: "neutral", announce: "off" };
    case "dirty": return { label: "Unsaved changes", tone: "warn", announce: "off" };
    case "saving": return { label: "Saving…", tone: "accent", announce: "polite" };
    case "saved": return { label: "Saved", tone: "ok", announce: "polite" };
    case "conflict": return { label: "Changed on disk", tone: "warn", announce: "assertive" };
    case "error": return { label: "Could not save", tone: "bad", announce: "assertive" };
  }
}
