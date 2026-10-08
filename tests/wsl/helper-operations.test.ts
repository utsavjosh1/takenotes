import { describe, expect, it } from "vitest";
import { HELPER_OPERATIONS, isHelperOperation } from "@takenotes/contracts/protocol";
import { HelperSupervisor } from "@takenotes/desktop/main/wsl/helper-supervisor";

/** 7e acceptance, main side: the operation allowlist fails fast without a
 * wire round-trip — no spawn, no frame, no session touched. */
describe("isHelperOperation", () => {
  it("accepts every implemented op", () => {
    for (const op of HELPER_OPERATIONS) expect(isHelperOperation(op)).toBe(true);
    expect(HELPER_OPERATIONS).toContain("users.list");
    expect(HELPER_OPERATIONS).toContain("file.delete");
  });

  it("rejects planned ops, typos, and non-strings", () => {
    for (const op of ["file.trash", "file.restore", "search.start", "search.cancel", "watch.subscribe", "watch.unsubscribe"]) {
      expect(isHelperOperation(op)).toBe(false);
    }
    expect(isHelperOperation("file.writ")).toBe(false);
    expect(isHelperOperation("")).toBe(false);
    expect(isHelperOperation(null)).toBe(false);
    expect(isHelperOperation(undefined)).toBe(false);
    expect(isHelperOperation(42)).toBe(false);
  });
});

describe("HelperSupervisor.request operation gate", () => {
  it("rejects disabled operations before touching the transport", async () => {
    const supervisor = new HelperSupervisor(() => undefined, () => undefined);
    for (const op of ["file.trash", "file.restore", "watch.subscribe", "search.start", "bogus.op"]) {
      const err = await supervisor.request(op, {}).then(
        () => null,
        (e: { code?: string; message?: string }) => e,
      );
      expect(err).toMatchObject({ code: "INVALID_REQUEST" });
      expect(String(err?.message)).toContain(op);
    }
    // Nothing was spawned, no session exists, state never left disconnected.
    expect(supervisor.getSession()).toBeNull();
    expect(supervisor.state).toBe("disconnected");
  });

  it("lets implemented operations through to the session check", async () => {
    const supervisor = new HelperSupervisor(() => undefined, () => undefined);
    const err = await supervisor.request("directory.list", { relativePath: "" }).then(
      () => null,
      (e: { code?: string }) => e,
    );
    expect(err).toMatchObject({ code: "DISCONNECTED" });
  });
});
