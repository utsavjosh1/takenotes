import { describe, expect, it } from "vitest";
import { parseTakenotesUri } from "@takenotes/core/uri/parse";

describe("takenotes:// uri parsing", () => {
  it("parses open with file/heading/block/pane", () => {
    const out = parseTakenotesUri("takenotes://open?path=Notes/a.md&heading=Intro&block=^abc-1&pane=tab");
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.uri.action).toEqual({ action: "open", path: "Notes/a.md", heading: "Intro", block: "abc-1", pane: "tab" });
    }
  });

  it("accepts the file alias and bare-caret-less blocks", () => {
    const out = parseTakenotesUri("takenotes://open?file=a.md&block=x9");
    if (!out.ok) expect.unreachable();
    else expect(out.uri.action).toEqual({ action: "open", path: "a.md", block: "x9" });
  });

  it("rejects escapes, bad panes, bad blocks, reserved and unknown hosts", () => {
    for (const raw of [
      "takenotes://open?path=../secret.md",
      "takenotes://open?path=/abs.md",
      "takenotes://open?pane=split",
      "takenotes://open?path=a.md&block=^no spaces",
      "takenotes://bundle/index.html",
      "takenotes://hook-get-address?x=1",
      "https://example.com",
      "not a uri",
      "",
    ]) {
      expect(parseTakenotesUri(raw).ok, raw).toBe(false);
    }
    const pane = parseTakenotesUri("takenotes://open?pane=split");
    if (pane.ok) expect.unreachable();
    else expect(pane.error.message).toMatch(/tab only/);
  });

  it("parses new/daily/search with honest edges", () => {
    const fresh = parseTakenotesUri("takenotes://new?name=Zettel&content=%23+Hi");
    if (!fresh.ok) expect.unreachable();
    else expect(fresh.uri.action).toEqual({ action: "new", name: "Zettel", content: "# Hi" });
    expect(parseTakenotesUri("takenotes://daily").ok).toBe(true);
    const query = parseTakenotesUri("takenotes://search?query=%40due%282026-10-09%29");
    if (!query.ok) expect.unreachable();
    else expect(query.uri.action).toEqual({ action: "search", query: "@due(2026-10-09)" });
    expect(parseTakenotesUri("takenotes://search").ok).toBe(false);
    expect(parseTakenotesUri("takenotes://new?path=../x.md").ok).toBe(false);
  });

  it("carries x-success/x-error as opaque echo, capped at 2 KiB", () => {
    const out = parseTakenotesUri("takenotes://daily?x-success=myapp%3A%2F%2Fok&x-error=myapp%3A%2F%2Ffail");
    if (!out.ok) expect.unreachable();
    else expect(out.uri).toMatchObject({ success: "myapp://ok", errorEcho: "myapp://fail" });
    expect(parseTakenotesUri(`takenotes://daily?x-success=${"s".repeat(3000)}`).ok).toBe(false);
  });
});
