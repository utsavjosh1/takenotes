import { describe, expect, it } from "vitest";
import { friendlyError } from "../../src/renderer/error-text";

/** P1-04 acceptance: the renderer shows PERMISSION_DENIED distinctly from
 * NOT_FOUND (the ticket's PATH_NOT_FOUND). A user locked out by Linux
 * permissions must never read "not found" — that lie sends them hunting for
 * a note that exists. */
describe("friendlyError", () => {
  it("renders PERMISSION_DENIED distinctly from NOT_FOUND", () => {
    const denied = friendlyError("PERMISSION_DENIED", "Permission denied: file.");
    const missing = friendlyError("NOT_FOUND", "file not found.");
    expect(denied).not.toBe(missing);
    expect(denied.toLowerCase()).toContain("permission denied");
    expect(denied.toLowerCase()).not.toContain("not found");
    expect(missing.toLowerCase()).toContain("not found");
    expect(missing.toLowerCase()).not.toContain("permission denied");
  });

  it("keeps the helper message so the detail stays expandable", () => {
    expect(friendlyError("PERMISSION_DENIED", "Permission denied: file.")).toContain("Permission denied: file.");
  });

  it("labels disconnection as unavailable, not missing", () => {
    const text = friendlyError("DISCONNECTED", "WSL helper is not connected.").toLowerCase();
    expect(text).toContain("unavailable");
    expect(text).not.toContain("not found");
  });

  it("falls back to the raw message for unknown codes", () => {
    expect(friendlyError("INTERNAL_ERROR", "Something broke.")).toContain("Something broke.");
  });
});
