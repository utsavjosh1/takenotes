import { describe, expect, it } from "vitest";
import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { SLASH_BLOCKS, slashCompletionSource } from "../../apps/desktop/src/renderer/editor/complete";

function run(doc: string, pos = doc.length) {
  const state = EditorState.create({ doc });
  return slashCompletionSource()(new CompletionContext(state, pos, true));
}

describe("slash block menu", () => {
  it("opens for / at the start of a line", () => {
    const r = run("/");
    expect(r?.options.map((o) => o.label)).toEqual(SLASH_BLOCKS.map((b) => b.label));
    expect(r?.from).toBe(1);
  });

  it("opens for an indented / and keeps typed filter text after the slash", () => {
    expect(run("  /hea")?.from).toBe(3);
  });

  it("stays closed mid-sentence and for paths", () => {
    expect(run("see a/b")).toBeNull();
    expect(run("https://x.y")).toBeNull();
    expect(run("plain text")).toBeNull();
  });

  it("only offers plain Markdown blocks", () => {
    for (const b of SLASH_BLOCKS) expect(b.insert).not.toMatch(/<[a-z]/i);
  });
});
