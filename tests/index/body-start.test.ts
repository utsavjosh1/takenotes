import { describe, expect, it } from "vitest";
import { parseDocument } from "../../src/shared/index/document";

/** P1-08 precondition support: the entry records where the body begins so
 * content snippets map to honest file lines (frontmatter excluded). */
describe("bodyStartLine", () => {
  it("points past frontmatter; 1 without frontmatter", () => {
    const rev = { hash: "h", size: 10, mtimeMs: 1 };
    const withFm = parseDocument("ws", "a.md", "---\ntitle: T\n---\n# H\n", rev);
    expect(withFm.bodyStartLine).toBe(4);
    const plain = parseDocument("ws", "b.md", "# H\n", rev);
    expect(plain.bodyStartLine).toBe(1);
    // Unclosed fence = no frontmatter: the whole file is body.
    const broken = parseDocument("ws", "c.md", "---\ntitle: [unclosed\n# H\n", rev);
    expect(broken.bodyStartLine).toBe(1);
  });
});
