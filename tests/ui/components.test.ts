import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ART_NAMES, Art, Badge, Button, Card, Checkbox, Chip, DataTable, EmptyState, ICON_NAMES, Icon, IconButton,
  Input, Kbd, Pill, Progress, Select, Skeleton, Stepper, Switch, Textarea,
} from "../../packages/ui/src/dom";
import { canonicalVariant } from "../../packages/ui/src/index";

/** Loosely typed createElement: these tests check markup, not prop typing. */
const h = createElement as (type: unknown, props: unknown, ...children: unknown[]) => ReactElement;
const html = (el: ReactElement) => renderToStaticMarkup(el);

describe("icons", () => {
  it("ports the whole prototype set", () => {
    expect(ICON_NAMES.length).toBeGreaterThanOrEqual(57);
    expect(ART_NAMES).toEqual(["notes", "search", "tasks", "tags", "agents", "calendar"]);
  });
  it("is decorative unless labelled", () => {
    expect(html(h(Icon, { name: "plus" }))).toContain('aria-hidden="true"');
    const labelled = html(h(Icon, { name: "plus", label: "Add" }));
    expect(labelled).toContain('role="img"');
    expect(labelled).toContain('aria-label="Add"');
    expect(html(h(Art, { name: "notes" }))).toContain('aria-hidden="true"');
  });
  it("sizes", () => {
    expect(html(h(Icon, { name: "x", size: "sm" }))).toContain("ui-icon--sm");
    expect(html(h(Icon, { name: "x", size: "xs" }))).toContain("ui-icon--xs");
  });
});

describe("button", () => {
  it("maps deprecated variants", () => {
    expect(canonicalVariant("secondary")).toBe("default");
    expect(canonicalVariant("quiet")).toBe("ghost");
    expect(canonicalVariant("destructive")).toBe("danger");
    expect(html(h(Button, { variant: "destructive" }, "Delete"))).toContain("tn-button--danger");
  });
  it("defaults to md, never submits implicitly", () => {
    const out = html(h(Button, null, "Go"));
    expect(out).toContain("tn-button--md");
    expect(out).toContain('type="button"');
  });
  it("pending blocks activation and marks busy", () => {
    const out = html(h(Button, { pending: true }, "Save"));
    expect(out).toContain('aria-busy="true"');
    expect(out).toContain('aria-disabled="true"');
  });
  it("icon button always has a name and tooltip", () => {
    const out = html(h(IconButton, { label: "Close" }, h(Icon, { name: "x" })));
    expect(out).toContain('aria-label="Close"');
    expect(out).toContain('title="Close"');
    expect(out).toContain("tn-button--ghost");
  });
});

describe("form controls", () => {
  it("flag invalid", () => {
    expect(html(h(Input, { invalid: true }))).toContain('aria-invalid="true"');
    expect(html(h(Select, { invalid: true }))).toContain('aria-invalid="true"');
    expect(html(h(Textarea, { invalid: true }))).toContain('aria-invalid="true"');
    expect(html(h(Input, {}))).not.toContain("aria-invalid");
  });
  it("switch is a named role=switch checkbox", () => {
    const out = html(h(Switch, { label: "Live preview", defaultChecked: true }));
    expect(out).toContain('role="switch"');
    expect(out).toContain('aria-label="Live preview"');
    expect(out).toContain('type="checkbox"');
  });
  it("checkbox label is associated with the input", () => {
    const out = html(h(Checkbox, { label: "Done", id: "c1" }));
    expect(out).toContain('for="c1"');
    expect(out).toContain('id="c1"');
  });
});

describe("badges", () => {
  it("tones", () => {
    expect(html(h(Chip, { tone: "due" }, "Today"))).toContain("ui-chip--due");
    expect(html(h(Chip, { tone: "planned" }, "x"))).toContain("ui-chip--planned");
    expect(html(h(Badge, { tone: "bad" }, "3"))).toContain("ui-badge--bad");
    expect(html(h(Pill, { tone: "ok", dot: true }, "Saved"))).toContain("ui-pill-dot");
    expect(html(h(Kbd, null, "Ctrl"))).toContain("<kbd");
  });
});

describe("surfaces", () => {
  it("skeleton announces loading", () => {
    const out = html(h(Skeleton, { lines: 2, label: "Loading notes" }));
    expect(out).toContain('role="status"');
    expect(out).toContain('aria-label="Loading notes"');
    expect(out.match(/<i/g)).toHaveLength(2);
  });
  it("progress exposes values, or none when indeterminate", () => {
    const known = html(h(Progress, { value: 30, label: "Importing" }));
    expect(known).toContain('aria-valuenow="30"');
    expect(known).toContain("inline-size:30%");
    expect(html(h(Progress, { label: "Working" }))).not.toContain("aria-valuenow");
  });
  it("stepper speaks each state", () => {
    const out = html(h(Stepper, { label: "Setup", steps: [
      { id: "a", label: "Check", state: "done" },
      { id: "b", label: "Install", state: "working" },
      { id: "c", label: "Start", state: "failed", error: "Port in use" },
    ] }));
    expect(out).toContain(": Done");
    expect(out).toContain('aria-current="step"');
    expect(out).toContain("Port in use");
  });
  it("card renders its tag", () => {
    expect(html(h(Card, { as: "section" }, "x"))).toMatch(/^<section/);
  });
  it("empty state shows built-in art", () => {
    const out = html(h(EmptyState, { title: "No notes", art: "notes" }));
    expect(out).toContain("ui-art");
    expect(out).toContain("<h2>No notes</h2>");
  });
});

describe("data table", () => {
  const rows = [{ id: "1", name: "A" }, { id: "2", name: "B" }];
  const columns = [{ key: "n", header: "Name", render: (r: { name: string }) => r.name }];
  it("rows are focusable only when activatable", () => {
    const plain = html(h(DataTable, { columns, rows, rowKey: (r: { id: string }) => r.id, label: "Notes" }));
    expect(plain).not.toContain("tabindex");
    const active = html(h(DataTable, { columns, rows, rowKey: (r: { id: string }) => r.id, label: "Notes", onRowActivate: () => {} }));
    expect(active).toContain('tabindex="0"');
    expect(active).toContain('scope="col"');
    expect(active).toContain('aria-label="Notes"');
  });
});
