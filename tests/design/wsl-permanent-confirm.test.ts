import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function rendererSource(...parts: string[]): string {
  return readFileSync(join(__dirname, "..", "..", "apps", "desktop", "src", "renderer", ...parts), "utf8");
}

/**
 * TN-DESIGN-002a post-fix: WSL permanent delete always confirms under defaults.
 * Native OS-trash stays setting-gated (recoverable, OS convention).
 */
describe("TN-DESIGN-002a WSL permanent delete always confirms", () => {
  const tree = rendererSource("hooks", "use-file-tree.ts");

  it("WSL file trash confirms unconditionally (not gated on confirmTrash)", () => {
    expect(tree).toContain("WSL trash is permanent: always confirm.");
    // WSL branch must call window.confirm without a confirmTrash guard.
    expect(tree).toContain('if (!window.confirm(`Permanently delete "${entry.name}"? This cannot be undone.`)) return;');
    // The old gated form must be gone for the WSL permanent path.
    expect(tree).not.toContain("confirmTrash && !window.confirm(wsl ?");
  });

  it("WSL folder delete confirms unconditionally", () => {
    expect(tree).toContain('if (!window.confirm(`Permanently delete folder "${entry.name}"? This cannot be undone.`)) return;');
    expect(tree).not.toContain("confirmTrash && !window.confirm(wslDel ?");
  });

  it("native OS-trash behavior unchanged (still setting-gated)", () => {
    expect(tree).toContain('confirmTrash && !window.confirm(`Move "${entry.name}" to trash?`)');
    expect(tree).toContain('confirmTrash && !window.confirm(`Delete folder "${entry.name}"?`)');
  });
});
