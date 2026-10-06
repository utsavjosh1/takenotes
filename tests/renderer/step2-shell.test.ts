import { describe, expect, it } from "vitest";
import { SIDEBAR_VIEWS } from "../../apps/desktop/src/renderer/components/chrome";
import { DEFAULT_SETTINGS } from "../../apps/desktop/src/renderer/components/types";
import { parseSettings } from "../../packages/core/src/validation/schemas";

/** Step 2 slice 5 gate: shell seam shape. */
describe("step2 shell seam", () => {
  it("fixes left-pane order; right sidebar stays an empty slot", () => {
    // Productivity steps 3/4 append the Today and Calendar panes; order
    // of the Step 2 panes stays frozen.
    expect([...SIDEBAR_VIEWS]).toEqual(["files", "search", "outline", "favorites", "today", "calendar"]);
  });

  it("shows the ribbon by default and parses the persisted flag", () => {
    expect(DEFAULT_SETTINGS.ribbonVisible).toBe(true);
    expect(parseSettings({ ribbonVisible: false })).toMatchObject({ ribbonVisible: false });
    expect(parseSettings({ ribbonVisible: "yes" })).not.toHaveProperty("ribbonVisible");
  });
});
