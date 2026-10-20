import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function rendererSource(...parts: string[]): string {
  return readFileSync(join(__dirname, "..", "..", "apps", "desktop", "src", "renderer", ...parts), "utf8");
}

/** Editor chrome (roadmap item 7, last among core): the implementation is
 * strong — roving tab strip, draft/conflict Notices with actions and
 * announcements, empty/load-error states — so this pins the contracts
 * instead of restyling. Deliberate non-change, recorded here: the audit's
 * suggestion-only `livePreview` → `wysiwygDecorations` prop rename is
 * declined because the key is persisted user settings (types.ts +
 * validation schema); renaming would silently reset saved prefs for a
 * cosmetic gain on the highest-risk surface. */
describe("editor chrome contracts", () => {
  it("conflict bar asserts with both resolutions", () => {
    const source = rendererSource("App.tsx");
    expect(source).toContain('title="File changed outside takenotes"');
    expect(source).toContain('announcement="assertive"');
    expect(source).toContain("Reload from disk");
    expect(source).toContain("Keep my version");
  });

  it("draft notice is polite with restore and discard", () => {
    const source = rendererSource("App.tsx");
    expect(source).toContain('title="An unsaved draft is available"');
    expect(source).toContain('announcement="polite"');
    expect(source).toContain("Restore draft");
    expect(source).toContain("Discard draft");
  });

  it("empty and load-error states stay actionable", () => {
    const source = rendererSource("App.tsx");
    expect(source).toContain('title="Choose a note to start writing."');
    expect(source).toContain("Create note");
    expect(source).toContain("Couldn’t open");
    expect(source).toContain("Your file is untouched.");
  });
});
