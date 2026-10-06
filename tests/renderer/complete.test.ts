import { describe, expect, it } from "vitest";
import { fileOption, headingOption, wikilinkCompletionSource } from "../../apps/desktop/src/renderer/editor/complete";
import type { WikilinkCandidate } from "@takenotes/core/links/completion";

/** Editor glue over the pure completion core. CodeMirror views cannot
 * exist in the node test env, so `apply` runs against a minimal fake
 * view capturing dispatched transactions. */

type FakeView = {
  state: { doc: { length: number }; sliceDoc: (f: number, t: number) => string };
  dispatched: unknown[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dispatch: (tr: any) => void;
};

function fakeView(afterCursor: string): FakeView {
  const view: FakeView = {
    state: { doc: { length: afterCursor.length }, sliceDoc: (f, t) => afterCursor.slice(f, t) },
    dispatched: [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dispatch(tr: any) {
      view.dispatched.push(tr);
    },
  };
  return view;
}

type ApplyFn = (view: never, completion: never, from: number, to: number) => void;

function runApply(opt: { apply?: unknown }, view: FakeView, from: number, to: number): void {
  (opt.apply as ApplyFn)(view as never, undefined as never, from, to);
}

function fakeContext(before: string) {
  return {
    state: { doc: { lineAt: (_pos: number) => ({ from: 0, text: before }) } },
    pos: before.length,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const CANDS: WikilinkCandidate[] = [
  { path: "archive/Note.md", name: "Note", sub: "archive" },
  { path: "projects/Note.md", name: "Note", sub: "projects" },
  { path: "hub.md", name: "hub", sub: "" },
];

const DEPS = {
  listFiles: () => CANDS,
  listHeadings: (path: string) => (path === "projects/Note.md" ? [{ text: "Plan", level: 2 } as const] : []),
  activePath: () => "hub.md",
  linkFormat: () => "shortest" as const,
};

describe("fileOption apply", () => {
  it("inserts shortest links and closes brackets", () => {
    const view = fakeView("");
    const opt = fileOption(CANDS[1]!, { activePath: "hub.md", format: "shortest", embed: false, ctxStart: 4 });
    runApply(opt, view, 6, 10);
    expect(view.dispatched).toEqual([{ changes: { from: 4, to: 10, insert: "[[Note]]" } }]);
  });

  it("honors relative format and embeds, and never duplicates ]]", () => {
    const view = fakeView("]] tail");
    const opt = fileOption(CANDS[1]!, { activePath: "hub.md", format: "relative", embed: true, ctxStart: 0 });
    runApply(opt, view, 3, 6);
    expect(view.dispatched).toEqual([{ changes: { from: 0, to: 6, insert: "![[projects/Note]]" } }]);
  });

  it("labels duplicates by basename with folder detail", () => {
    const a = fileOption(CANDS[0]!, { activePath: "hub.md", format: "shortest", embed: false, ctxStart: 0 });
    const b = fileOption(CANDS[1]!, { activePath: "hub.md", format: "shortest", embed: false, ctxStart: 0 });
    expect([a.label, a.detail]).toEqual(["Note", "archive"]);
    expect([b.label, b.detail]).toEqual(["Note", "projects"]);
  });
});

describe("headingOption apply", () => {
  it("replaces only the #frag tail", () => {
    const view = fakeView("");
    const opt = headingOption({ text: "Plan", level: 2 });
    runApply(opt, view, 12, 15);
    expect(view.dispatched).toEqual([{ changes: { from: 12, to: 15, insert: "#Plan]]" } }]);
  });
});

describe("wikilinkCompletionSource", () => {
  const source = wikilinkCompletionSource(DEPS);

  it("completes files inside [[ with folder detail", () => {
    const res = source(fakeContext("see [[No"));
    expect(res?.from).toBe(6);
    expect(res?.options.map((o) => [o.label, o.detail])).toEqual([
      ["Note", "archive"],
      ["Note", "projects"],
      ["hub", undefined],
    ]);
  });

  it("completes headings inside [[file#", () => {
    const res = source(fakeContext("[[projects/Note#Pl"));
    expect(res?.options.map((o) => o.label)).toEqual(["Plan"]);
  });

  it("resolves nothing for unknown files or aliases", () => {
    expect(source(fakeContext("[[Ghost#x"))).toBeNull();
    expect(source(fakeContext("[[Note|x"))).toBeNull();
    expect(source(fakeContext("plain"))).toBeNull();
  });
});
