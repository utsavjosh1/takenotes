import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function rendererSource(...parts: string[]): string {
  return readFileSync(join(__dirname, "..", "..", "apps", "desktop", "src", "renderer", ...parts), "utf8");
}

/** Collections add-view row: the kind selector must stay wired to the
 * addView call — regression guard against hardcoding one view kind. */
describe("collections view-kind selector", () => {
  it("offers a table/list choice bound to addView", () => {
    const source = rendererSource("components", "collections.tsx");
    expect(source).toContain('aria-label="New view kind"');
    expect(source).toContain('kind: newKind');
    expect(source).toContain('<option value="list">');
    expect(source).toContain('<option value="table">');
  });
});
