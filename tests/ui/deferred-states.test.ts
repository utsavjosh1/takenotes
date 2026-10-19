import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function rendererSource(...parts: string[]): string {
  return readFileSync(join(__dirname, "..", "..", "apps", "desktop", "src", "renderer", ...parts), "utf8");
}

/** Deferred-surface states (roadmap item 9): no restyles — every surface
 * keeps its flows, but no state renders blank or offers a dead action.
 * WSL + MCP audited covered (distro/user/empty/error/pending states,
 * loading/error/empty clients + activity); these two pin the gaps found. */
describe("deferred-surface states", () => {
  it("empty canvas guides instead of showing a blank svg", () => {
    const source = rendererSource("components", "canvas.tsx");
    expect(source).toContain("doc.nodes.length === 0");
    expect(source).toContain("Empty canvas");
  });

  it("import preview with zero notes disables confirm", () => {
    const source = rendererSource("components", "import-dialog.tsx");
    expect(source).toContain("preview.notes.length === 0");
    expect(source).toContain("disabled={busy || preview.notes.length === 0}");
    expect(source).toContain("Nothing to import");
  });
});
