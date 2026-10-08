import { describe, expect, it } from "vitest";
import { extractUriArg } from "@takenotes/desktop/main/uri/handler";

describe("uri argv extraction", () => {
  it("finds the first takenotes:// arg past flags", () => {
    expect(extractUriArg(["/app/electron", "--foo", "takenotes://daily"])).toBe("takenotes://daily");
    expect(extractUriArg(["/app/electron", "takenotes://open?path=a.md", "takenotes://search?query=x"])).toBe(
      "takenotes://open?path=a.md",
    );
  });

  it("ignores case on the scheme and misses cleanly", () => {
    expect(extractUriArg(["/app/electron", "TAKENOTES://daily"])).toBe("TAKENOTES://daily");
    expect(extractUriArg(["/app/electron", "--dev"])).toBeNull();
    expect(extractUriArg(["/app/electron", "https://example.com"])).toBeNull();
  });
});
