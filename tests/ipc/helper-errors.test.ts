import { describe, expect, it } from "vitest";
import { toHelperError } from "../../src/main/ipc/helper-errors";

/** P1-04 acceptance: structured helper error codes survive the IPC boundary.
 * `toHelperError` is the single chokepoint every WSL IPC handler uses — a
 * PERMISSION_DENIED from the helper must still be PERMISSION_DENIED when it
 * reaches the renderer, never flattened to INTERNAL_ERROR. */
describe("toHelperError preserves structured codes", () => {
  it.each([
    "NOT_FOUND",
    "ALREADY_EXISTS",
    "PERMISSION_DENIED",
    "OUTSIDE_ROOT",
    "INVALID_PATH",
    "INVALID_REQUEST",
    "CONFLICT",
    "DIRECTORY_NOT_EMPTY",
    "TOO_LARGE",
    "DISCONNECTED",
  ] as const)("passes %s through unchanged", (code) => {
    expect(toHelperError({ code, message: "helper said so" })).toEqual({ code, message: "helper said so" });
  });

  it("keeps machine-readable detail when present", () => {
    expect(toHelperError({ code: "PERMISSION_DENIED", message: "denied", detail: "EACCES" })).toEqual({
      code: "PERMISSION_DENIED",
      message: "denied",
      detail: "EACCES",
    });
  });

  it("maps unstructured failures to INTERNAL_ERROR without losing the cause", () => {
    const out = toHelperError(new Error("boom"));
    expect(out.code).toBe("INTERNAL_ERROR");
    expect(out.message).toBe("WSL operation failed.");
    expect(out.detail).toContain("boom");
  });

  it("maps code-less objects to INTERNAL_ERROR", () => {
    expect(toHelperError({ message: "no code" }).code).toBe("INTERNAL_ERROR");
    expect(toHelperError(null).code).toBe("INTERNAL_ERROR");
    expect(toHelperError("string failure").code).toBe("INTERNAL_ERROR");
  });
});
