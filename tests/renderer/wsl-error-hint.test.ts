import { describe, expect, it } from "vitest";
import { describeWslError, wslErrorHint } from "@takenotes/desktop/renderer/error-text";

/** 7c acceptance: roadmap path-error names (PATH_NOT_FOUND,
 * NOT_A_DIRECTORY, CONNECTION_FAILED, DISTRO_NOT_RUNNING, HELPER_FAILED)
 * are UI-facing synonyms over the canonical wire codes — each branch below
 * pins one mapping so a rename can never slip in silently. */
describe("wslErrorHint", () => {
  it("PATH_NOT_FOUND: missing folder on open names the fix", () => {
    const hint = wslErrorHint("NOT_FOUND", { operation: "open", distro: "Ubuntu" })!;
    expect(hint).toContain("Ubuntu");
    expect(hint.toLowerCase()).toContain("case-sensitive");
    expect(hint.toLowerCase()).toContain("create");
  });

  it("NOT_FOUND off the open path stays generic but never blames permissions", () => {
    const hint = wslErrorHint("NOT_FOUND", { operation: "list" })!;
    expect(hint.toLowerCase()).not.toContain("permission");
  });

  it("NOT_A_DIRECTORY: file-picked-as-folder says so", () => {
    const hint = wslErrorHint("INVALID_REQUEST", { operation: "open", distro: "Debian" })!;
    expect(hint).toContain("Debian");
    expect(hint.toLowerCase()).toContain("isn't a folder");
  });

  it("INVALID_REQUEST off the open path offers no hint", () => {
    expect(wslErrorHint("INVALID_REQUEST", { operation: "request" })).toBeNull();
  });

  it("PERMISSION_DENIED names the run-as user and the 700-home fix", () => {
    const hint = wslErrorHint("PERMISSION_DENIED", { distro: "Ubuntu", linuxUser: "utsav" })!;
    expect(hint).toContain("utsav");
    expect(hint.toLowerCase()).toContain("never escalates");
    expect(hint).toContain("700");
  });

  it("PERMISSION_DENIED without context degrades gracefully, never wrong", () => {
    const hint = wslErrorHint("PERMISSION_DENIED", {})!;
    expect(hint.toLowerCase()).toContain("never escalates");
    expect(hint).not.toContain("undefined");
  });

  it("CONNECTION_FAILED/HELPER_FAILED/DISTRO_NOT_RUNNING: connect-phase disconnect covers all three", () => {
    const hint = wslErrorHint("DISCONNECTED", { operation: "connect", distro: "Ubuntu" })!;
    expect(hint).toContain("Ubuntu");
    expect(hint.toLowerCase()).toContain("didn't start");
    expect(hint.toLowerCase()).toContain("stopped");
  });

  it("dropped mid-session connections say reconnect, not reinstall", () => {
    const hint = wslErrorHint("DISCONNECTED", { operation: "request" })!;
    expect(hint.toLowerCase()).toContain("reconnect");
    expect(hint.toLowerCase()).not.toContain("install");
  });

  it("OUTSIDE_ROOT points back inside the workspace", () => {
    expect(wslErrorHint("OUTSIDE_ROOT", {})!.toLowerCase()).toContain("escapes the workspace");
  });

  it("codes with no specific guidance return null", () => {
    expect(wslErrorHint("CONFLICT", { operation: "open" })).toBeNull();
    expect(wslErrorHint("TOO_LARGE", {})).toBeNull();
    expect(wslErrorHint("INTERNAL_ERROR", {})).toBeNull();
  });
});

describe("describeWslError", () => {
  it("composes headline + message + hint", () => {
    const text = describeWslError("NOT_FOUND", "Workspace directory not found.", { operation: "open", distro: "Ubuntu" });
    expect(text).toContain("Not found");
    expect(text).toContain("Workspace directory not found.");
    expect(text.toLowerCase()).toContain("case-sensitive");
  });

  it("equals friendlyError when no hint applies", () => {
    expect(describeWslError("CONFLICT", "The file changed on disk.")).toBe("Changed on disk — The file changed on disk.");
    expect(describeWslError("DISCONNECTED", "Gone.", {})).toContain("Reconnect the workspace");
  });
});
