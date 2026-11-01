import { describe, expect, it } from "vitest";
import {
  canDismissDialog, emptyToasts, flattenGroups, menuMove, navigableIndices, paletteMove, placeOverlay,
  saveStatus, splitOverflow, tabMove, toastReducer, typeaheadAppend, typeaheadFind, TOAST_QUEUE_MAX,
  type MenuEntry, type ToastState,
} from "../../packages/ui/src/index";

const vp = { width: 1000, height: 700 };

describe("placeOverlay", () => {
  const size = { width: 200, height: 160 };
  it("opens below the anchor when it fits", () => {
    expect(placeOverlay({ left: 100, top: 100, width: 80, height: 30 }, size, vp)).toEqual({ left: 100, top: 134, placement: "bottom-start" });
  });
  it("flips above when below overflows", () => {
    const r = placeOverlay({ left: 100, top: 600, width: 80, height: 30 }, size, vp);
    expect(r.placement).toBe("top-start");
    expect(r.top).toBe(600 - 160 - 4);
  });
  it("clamps inside the viewport for a point anchor at the corner", () => {
    const r = placeOverlay({ left: 990, top: 695, width: 0, height: 0 }, size, vp);
    expect(r.left).toBe(1000 - 200 - 8);
    expect(r.placement).toBe("top-start");
    expect(r.top).toBe(695 - 160 - 4);
  });
  it("aligns to the end edge", () => {
    expect(placeOverlay({ left: 400, top: 50, width: 100, height: 30 }, size, vp, "bottom-end").left).toBe(300);
  });
  it("never leaves the margin even when nothing fits", () => {
    const r = placeOverlay({ left: 0, top: 0, width: 10, height: 10 }, { width: 2000, height: 2000 }, vp);
    expect(r.left).toBe(8);
    expect(r.top).toBe(8);
  });
  it("opens a submenu to the side, flipping at the right edge", () => {
    expect(placeOverlay({ left: 100, top: 100, width: 200, height: 28 }, size, vp, "right-start").left).toBe(304);
    expect(placeOverlay({ left: 780, top: 100, width: 200, height: 28 }, size, vp, "right-start").left).toBe(576);
  });
});

describe("menu navigation", () => {
  const items: MenuEntry[] = [
    { label: "Open" }, { label: "Rename", disabled: true }, { label: "", separator: true }, { label: "Delete" }, { label: "Duplicate" },
  ];
  it("skips separators but keeps disabled items reachable", () => {
    expect(navigableIndices(items)).toEqual([0, 1, 3, 4]);
    expect(menuMove(items, 1, "ArrowDown")).toBe(3);
    expect(menuMove(items, 3, "ArrowUp")).toBe(1);
  });
  it("wraps and supports Home/End", () => {
    expect(menuMove(items, 4, "ArrowDown")).toBe(0);
    expect(menuMove(items, 0, "ArrowUp")).toBe(4);
    expect(menuMove(items, 3, "Home")).toBe(0);
    expect(menuMove(items, 0, "End")).toBe(4);
  });
  it("ignores keys it does not own, and an empty menu", () => {
    expect(menuMove(items, 0, "a")).toBeNull();
    expect(menuMove([], 0, "ArrowDown")).toBeNull();
    expect(menuMove(items, 0, "ArrowRight")).toBeNull();
  });
  it("typeahead builds a buffer that expires", () => {
    let s = { buffer: "", at: 0 };
    s = typeaheadAppend(s, "d", 1000)!;
    s = typeaheadAppend(s, "u", 1200)!;
    expect(s.buffer).toBe("du");
    expect(typeaheadFind(items, 0, s.buffer)).toBe(4);
    s = typeaheadAppend(s, "o", 5000)!;
    expect(s.buffer).toBe("o");
    expect(typeaheadAppend(s, "Enter", 5001)).toBeNull();
    expect(typeaheadAppend({ buffer: "", at: 0 }, " ", 1)).toBeNull();
  });
  it("repeating a letter cycles through matches", () => {
    expect(typeaheadFind(items, 3, "d")).toBe(4);
    expect(typeaheadFind(items, 4, "dd")).toBe(3);
    expect(typeaheadFind(items, 0, "z")).toBeNull();
    expect(typeaheadFind(items, 0, "")).toBeNull();
  });
});

describe("toast queue", () => {
  const push = (s: ToastState, text: string, extra: object = {}) => toastReducer(s, { type: "push", text, ...extra });
  it("shows one at a time and advances in order", () => {
    let s = push(push(push(emptyToasts, "a"), "b"), "c");
    expect(s.current?.text).toBe("a");
    expect(s.queue.map((t) => t.text)).toEqual(["b", "c"]);
    s = toastReducer(s, { type: "end", id: s.current!.id });
    expect(s.current?.text).toBe("b");
    s = toastReducer(s, { type: "end", id: s.current!.id });
    s = toastReducer(s, { type: "end", id: s.current!.id });
    expect(s.current).toBeNull();
  });
  it("an error replaces plain information at once", () => {
    const s = push(push(emptyToasts, "info"), "boom", { kind: "error" });
    expect(s.current?.text).toBe("boom");
    expect(s.current?.kind).toBe("error");
  });
  it("an error never hides an Undo offer: it waits first in line", () => {
    const s = push(push(push(emptyToasts, "Deleted", { undoLabel: "Undo" }), "later"), "boom", { kind: "error" });
    expect(s.current?.text).toBe("Deleted");
    expect(s.queue.map((t) => t.text)).toEqual(["boom", "later"]);
  });
  it("a second error does not replace a visible error", () => {
    const s = push(push(emptyToasts, "e1", { kind: "error" }), "e2", { kind: "error" });
    expect(s.current?.text).toBe("e1");
    expect(s.queue[0]?.text).toBe("e2");
  });
  it("ending a queued toast removes only it; unknown ids change nothing", () => {
    const s = push(push(push(emptyToasts, "a"), "b"), "c");
    const t = toastReducer(s, { type: "end", id: s.queue[0]!.id });
    expect(t.queue.map((x) => x.text)).toEqual(["c"]);
    expect(toastReducer(t, { type: "end", id: 999 })).toEqual(t);
  });
  it("caps the queue and gives unique ids", () => {
    let s = emptyToasts;
    for (let i = 0; i < 20; i++) s = push(s, `t${i}`);
    expect(s.queue).toHaveLength(TOAST_QUEUE_MAX);
    expect(new Set([s.current!.id, ...s.queue.map((t) => t.id)]).size).toBe(TOAST_QUEUE_MAX + 1);
  });
  it("carries the Undo label only when given", () => {
    expect(push(emptyToasts, "x").current).not.toHaveProperty("undoLabel");
    expect(push(emptyToasts, "x", { undoLabel: "Undo" }).current?.undoLabel).toBe("Undo");
  });
});

describe("tab overflow", () => {
  const w = [100, 100, 100, 100, 100];
  it("keeps everything when it fits", () => {
    expect(splitOverflow(w, 0, 600, 40)).toEqual({ visible: [0, 1, 2, 3, 4], hidden: [] });
  });
  it("always keeps the active tab, then its neighbours", () => {
    const r = splitOverflow(w, 4, 330, 40);
    expect(r.visible).toContain(4);
    expect(r.visible).toEqual([3, 4]);
    expect(r.hidden).toEqual([0, 1, 2]);
  });
  it("keeps the active tab even when it alone overflows", () => {
    expect(splitOverflow(w, 2, 50, 40).visible).toEqual([2]);
  });
  it("covers every tab exactly once", () => {
    const r = splitOverflow([80, 120, 90, 150, 60, 110], 3, 400, 36);
    expect([...r.visible, ...r.hidden].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it("tabMove wraps and ignores vertical arrows", () => {
    expect(tabMove(3, 2, "ArrowRight")).toBe(0);
    expect(tabMove(3, 0, "ArrowLeft")).toBe(2);
    expect(tabMove(3, 1, "ArrowDown")).toBeNull();
    expect(tabMove(0, 0, "ArrowRight")).toBeNull();
  });
});

describe("palette", () => {
  it("clamps instead of wrapping", () => {
    expect(paletteMove(2, 3, "ArrowDown")).toBe(2);
    expect(paletteMove(0, 3, "ArrowUp")).toBe(0);
    expect(paletteMove(1, 3, "Home")).toBe(0);
    expect(paletteMove(1, 3, "End")).toBe(2);
    expect(paletteMove(0, 0, "ArrowDown")).toBeNull();
    expect(paletteMove(0, 3, "a")).toBeNull();
  });
  it("flattens groups and marks group starts", () => {
    const flat = flattenGroups([{ heading: "Recent", items: ["a", "b"] }, { items: ["c"] }]);
    expect(flat.map((r) => r.item)).toEqual(["a", "b", "c"]);
    expect(flat.map((r) => r.firstInGroup)).toEqual([true, false, true]);
    expect(flat[2]).not.toHaveProperty("heading");
  });
});

describe("dialog dismissal", () => {
  it("escape and backdrop keep typed input, the close button does not", () => {
    const p = { unsavedInput: true, closeOnBackdrop: true };
    expect(canDismissDialog("escape", p)).toBe(false);
    expect(canDismissDialog("backdrop", p)).toBe(false);
    expect(canDismissDialog("close", p)).toBe(true);
  });
  it("is blocked entirely when not dismissible", () => {
    expect(canDismissDialog("close", { dismissible: false })).toBe(false);
    expect(canDismissDialog("escape", { dismissible: false })).toBe(false);
  });
  it("keeps the safe default for the backdrop", () => {
    expect(canDismissDialog("backdrop", {})).toBe(false);
    expect(canDismissDialog("backdrop", { closeOnBackdrop: true })).toBe(true);
    expect(canDismissDialog("escape", {})).toBe(true);
  });
});

describe("save status", () => {
  it("says Saved only after a finished save", () => {
    expect(saveStatus("dirty").label).not.toMatch(/^saved/i);
    expect(saveStatus("saving").label).not.toMatch(/^saved/i);
    expect(saveStatus("saved").label).toBe("Saved");
  });
  it("announces failures assertively and typing never", () => {
    expect(saveStatus("error").announce).toBe("assertive");
    expect(saveStatus("conflict").announce).toBe("assertive");
    expect(saveStatus("dirty").announce).toBe("off");
    expect(saveStatus("clean").announce).toBe("off");
  });
  it("uses plain words, not codes", () => {
    for (const s of ["clean", "dirty", "saving", "saved", "conflict", "error"] as const) {
      expect(saveStatus(s).label).not.toMatch(/conflict|error|CONFLICT/);
    }
  });
});
