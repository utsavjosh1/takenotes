import { describe, expect, it } from "vitest";
import { extractAtxHeadings } from "@takenotes/core/outline/extract";

/** Fence-length handling: a fence closes only on the same marker char, at
 * least as long as the opener, with nothing but whitespace after it. */
describe("outline fence tracking", () => {
  it("ignores headings inside a four-backtick block closed by three backticks", () => {
    const content = [
      "````",
      "# inside four-tick block",
      "```",
      "# still inside (inner fence is too short to close)",
      "````",
      "# real heading",
    ].join("\n");
    expect(extractAtxHeadings(content).map((h) => h.text)).toEqual(["real heading"]);
  });

  it("does not treat an info string after a closing marker as a close", () => {
    const content = [
      "```",
      "# hidden",
      "```js",
      "# still hidden",
      "```",
      "# shown",
    ].join("\n");
    expect(extractAtxHeadings(content).map((h) => h.text)).toEqual(["shown"]);
  });

  it("keeps backtick and tilde fences independent", () => {
    const content = ["~~~", "# hidden by tildes", "```", "# still hidden", "~~~", "# shown"].join("\n");
    expect(extractAtxHeadings(content).map((h) => h.text)).toEqual(["shown"]);
  });
});
