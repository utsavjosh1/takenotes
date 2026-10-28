import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BANNER_MAX_ACTIONS, Banner, CommandPalette, ConfirmDialog, ErrorDialog, Menu, Rail, SaveStatePill, StatusBar, Tabs,
  Button, TitleBar, ToastProvider, TreeRow, describeCount, type MenuItemDef,
} from "../../packages/ui/src/dom";

const h = createElement as (type: unknown, props: unknown, ...children: unknown[]) => ReactElement;
const html = (el: ReactElement) => renderToStaticMarkup(el);
const noop = () => {};

describe("Banner", () => {
  it("announces warn and danger, not info", () => {
    expect(html(h(Banner, { tone: "warn", title: "Changed on disk." }))).toContain('role="alert"');
    expect(html(h(Banner, { tone: "danger", title: "x" }))).toContain('role="alert"');
    expect(html(h(Banner, { title: "Indexing" }))).not.toContain("role=");
  });
  it("keeps at most three actions", () => {
    const actions = [1, 2, 3, 4, 5].map((n) => h(Button, { key: n }, `A${n}`));
    const out = html(h(Banner, { title: "t", actions }));
    expect(BANNER_MAX_ACTIONS).toBe(3);
    expect(out).toContain("A3");
    expect(out).not.toContain("A4");
  });
  it("leads with a bold sentence", () => {
    expect(html(h(Banner, { title: "Could not save." }, "Check the folder."))).toContain("<strong>Could not save.</strong> Check the folder.");
  });
});

describe("Menu", () => {
  const items: MenuItemDef[] = [
    { id: "open", label: "Open", hint: "Enter" },
    { id: "sep", label: "", separator: true },
    { id: "rename", label: "Rename", disabled: "Open a note first" },
    { id: "del", label: "Delete", danger: true },
  ];
  const out = html(h(Menu, { items, anchor: { x: 10, y: 10 }, label: "Actions", onSelect: noop, onClose: noop }));
  it("has the menu roles", () => {
    expect(out).toContain('role="menu"');
    expect(out.match(/role="menuitem"/g)).toHaveLength(3);
    expect(out).toContain('role="separator"');
  });
  it("starts with one tab stop, on the first enabled item", () => {
    expect(out.match(/tabindex="0"/g)).toHaveLength(1);
    expect(out.indexOf('tabindex="0"')).toBeLessThan(out.indexOf("Rename"));
  });
  it("explains a disabled item and keeps it focusable", () => {
    expect(out).toContain('aria-disabled="true"');
    expect(out).toContain("Open a note first");
    expect(out).toContain("aria-describedby");
  });
  it("marks danger and shows the shortcut", () => {
    expect(out).toContain("ui-mi--danger");
    expect(out).toContain("<kbd");
  });
  it("renders hidden until it has been measured", () => {
    expect(out).toContain("visibility:hidden");
  });
});

describe("dialogs", () => {
  it("describes counts exactly", () => {
    expect(describeCount(1, "note")).toBe("1 note");
    expect(describeCount(3, "note")).toBe("3 notes");
    expect(describeCount(1200, "file")).toBe("1,200 files");
    expect(describeCount(2, "category", "categories")).toBe("2 categories");
  });
  it("confirm states the count and puts Cancel before the decision", () => {
    const out = html(h(ConfirmDialog, { title: "Delete notes", destructive: true, confirmLabel: "Delete 3 notes", onConfirm: noop, onCancel: noop,
      count: { n: 3, singular: "note" } }, "They move to the trash."));
    expect(out).toContain("3 notes will be affected.");
    expect(out.indexOf("Cancel")).toBeLessThan(out.indexOf("Delete 3 notes"));
    expect(out).toContain("ui-solid-danger");
  });
  it("error keeps technical text collapsed behind Details with one action", () => {
    const out = html(h(ErrorDialog, { title: "Could not save the note", cause: "The folder is read-only.", details: "EACCES: permission denied",
      action: { label: "Choose another folder", run: noop }, onClose: noop }));
    expect(out).toContain("<details");
    expect(out).not.toContain("<details open");
    expect(out).toContain("<summary>Details</summary>");
    expect(out.indexOf("The folder is read-only.")).toBeLessThan(out.indexOf("EACCES"));
    expect(out).toContain("Choose another folder");
  });
});

describe("CommandPalette", () => {
  const groups = [{ heading: "Recent", items: [{ id: "a", label: "Weekly plan", description: "Projects" }, { id: "b", label: "Delete note", disabledReason: "Open a note first" }] }];
  const out = html(h(CommandPalette, { label: "Quick open", query: "", onQueryChange: noop, onSelect: noop, onClose: noop, groups,
    hints: [{ keys: ["Enter"], text: "open" }], modes: [{ id: "c", label: "Commands", key: ">", active: false }] }));
  it("uses combobox and listbox roles", () => {
    expect(out).toContain('role="combobox"');
    expect(out).toContain('role="listbox"');
    expect(out.match(/role="option"/g)).toHaveLength(2);
    expect(out).toContain("aria-activedescendant");
    expect(out).toContain('aria-modal="true"');
  });
  it("selects the first row and explains a disabled one", () => {
    expect(out.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(out).toContain('aria-disabled="true"');
    expect(out).toContain("Open a note first");
  });
  it("shows the group heading and key hints", () => {
    expect(out).toContain(">Recent<");
    expect(out).toContain("open");
  });
  it("says so when nothing matches", () => {
    const empty = html(h(CommandPalette, { label: "x", query: "zz", onQueryChange: noop, onSelect: noop, onClose: noop, groups: [], emptyText: "No notes match." }));
    expect(empty).toContain("No notes match.");
    expect(empty).not.toContain("aria-activedescendant");
    expect(empty).toContain('aria-expanded="false"');
  });
});

describe("Tabs", () => {
  const tabs = [{ id: "1", label: "Plan", dirty: true }, { id: "2", label: "Notes" }, { id: "3", label: "Ideas", conflict: true, pinned: true }];
  const out = html(h(Tabs, { tabs, activeId: "2", onActivate: noop, onClose: noop }));
  it("is a tablist of tabs with one tab stop", () => {
    expect(out).toContain('role="tablist"');
    expect(out.match(/role="tab"/g)).toHaveLength(3);
    expect(out.match(/tabindex="0"/g)).toHaveLength(1);
    expect(out).toContain('aria-selected="true"');
  });
  it("says the state in words, not only a dot", () => {
    expect(out).toContain('aria-label="Plan, unsaved changes"');
    expect(out).toContain('aria-label="Ideas, changed on disk, pinned"');
  });
  it("gives every tab a named close button", () => {
    expect(out).toContain('aria-label="Close Plan"');
  });
  it("falls back to the first tab as the tab stop when none is active", () => {
    const none = html(h(Tabs, { tabs, activeId: null, onActivate: noop, onClose: noop }));
    expect(none.indexOf('tabindex="0"')).toBeLessThan(none.indexOf("Notes"));
  });
});

describe("shell", () => {
  it("tree row exposes level, expansion and selection", () => {
    const folder = html(h(TreeRow, { label: "Projects", folder: true, expanded: true, depth: 1, count: 4 }));
    expect(folder).toContain('aria-level="2"');
    expect(folder).toContain('aria-expanded="true"');
    expect(folder).toContain(">4<");
    const file = html(h(TreeRow, { label: "Plan", active: true }));
    expect(file).not.toContain("aria-expanded");
    expect(file).toContain('aria-selected="true"');
  });
  it("rail buttons are named and mark the current page", () => {
    const out = html(h(Rail, { items: [{ id: "f", label: "Files", icon: "file", active: true, onSelect: noop }, { id: "s", label: "Search", icon: "search", hint: "Ctrl+F", onSelect: noop }],
      footer: [{ id: "g", label: "Settings", icon: "gear", onSelect: noop }] }));
    expect(out).toContain('aria-label="Files" aria-current="page"');
    expect(out).toContain('title="Search (Ctrl+F)"');
    expect(out).toContain('aria-label="Settings"');
    expect(out).toContain('<nav class="ui-rail"');
  });
  it("title bar is the banner landmark; status bar is the footer", () => {
    expect(html(h(TitleBar, { start: "a" }))).toContain('role="banner"');
    expect(html(h(StatusBar, { start: "a" }))).toMatch(/^<footer/);
  });
  it("save pill announces only finished or failed saves", () => {
    expect(html(h(SaveStatePill, { state: "dirty" }))).not.toContain("role=");
    expect(html(h(SaveStatePill, { state: "saved" }))).toContain('role="status"');
    expect(html(h(SaveStatePill, { state: "error" }))).toContain('role="alert"');
    expect(html(h(SaveStatePill, { state: "conflict" }))).toContain("Changed on disk");
  });
  it("toast provider renders its children and an empty live area", () => {
    const out = html(h(ToastProvider, null, h("p", null, "app")));
    expect(out).toContain("<p>app</p>");
    expect(out).toContain("ui-toasts");
    expect(out).not.toContain("ui-toast ");
  });
});
