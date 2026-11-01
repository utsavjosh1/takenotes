import { describe, expect, it } from "vitest";
import { removeScheduledToken, rewriteScheduledHour } from "@takenotes/core/productivity/calendar";

describe("rewriteScheduledHour", () => {
  it("adds a token when none exists and leaves @due alone", () => {
    expect(rewriteScheduledHour("- [ ] Draft @due(2026-10-30)", "2026-10-28", 9)).toBe("- [ ] Draft @due(2026-10-30) @scheduled(2026-10-28T09:00)");
  });
  it("replaces an existing scheduled time only", () => {
    expect(rewriteScheduledHour("- [ ] A @scheduled(2026-10-27T08:30) @due(2026-11-01)", "2026-10-28", 14)).toBe("- [ ] A @scheduled(2026-10-28T14:00) @due(2026-11-01)");
  });
  it("rejects bad input", () => {
    expect(() => rewriteScheduledHour("- [ ] A", "tomorrow", 9)).toThrow();
    expect(() => rewriteScheduledHour("- [ ] A", "2026-10-28", 24)).toThrow();
  });
});

describe("removeScheduledToken", () => {
  it("drops only the scheduled token", () => {
    expect(removeScheduledToken("- [ ] A @scheduled(2026-10-28T09:00) @due(2026-11-01)")).toBe("- [ ] A @due(2026-11-01)");
  });
});
