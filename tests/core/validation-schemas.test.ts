import { describe, expect, it } from "vitest";
import {
  parseLoginPassword,
  parsePasswordChange,
  parseSettings,
  WslConnectSchema,
} from "@takenotes/core/validation/schemas";
import * as v from "valibot";

describe("settings parsing (localStorage input is untrusted)", () => {
  it("accepts a valid partial object", () => {
    expect(parseSettings({ theme: "dark", fontSize: 18 })).toEqual({ theme: "dark", fontSize: 18 });
  });

  it("drops invalid fields but keeps valid ones", () => {
    expect(parseSettings({ theme: "neon", fontSize: 18, wordWrap: "yes" })).toEqual({ fontSize: 18 });
  });

  it("strips unknown future keys", () => {
    expect(parseSettings({ theme: "light", someFutureFlag: true })).toEqual({ theme: "light" });
  });

  it("accepts the WSL feature flag and drops a corrupt one", () => {
    expect(parseSettings({ wslEnabled: true })).toEqual({ wslEnabled: true });
    expect(parseSettings({ wslEnabled: "yes", theme: "dark" })).toEqual({ theme: "dark" });
  });

  it("yields {} for garbage input", () => {
    expect(parseSettings(null)).toEqual({});
    expect(parseSettings("dark")).toEqual({});
    expect(parseSettings([1, 2])).toEqual({});
  });
});

describe("auth body parsing (fail-closed like the hand-rolled checks)", () => {
  it("accepts a real password", () => {
    expect(parseLoginPassword({ password: "correct-horse" })).toBe("correct-horse");
  });

  it("rejects missing, non-string, and empty passwords", () => {
    expect(parseLoginPassword(null)).toBeNull();
    expect(parseLoginPassword({})).toBeNull();
    expect(parseLoginPassword({ password: 42 })).toBeNull();
    expect(parseLoginPassword({ password: "" })).toBeNull();
  });

  it("accepts a well-formed password change", () => {
    expect(parsePasswordChange({ currentPassword: "old", nextPassword: "new-long-enough" })).toEqual({
      currentPassword: "old",
      nextPassword: "new-long-enough",
    });
  });

  it("rejects malformed password changes", () => {
    expect(parsePasswordChange(null)).toBeNull();
    expect(parsePasswordChange({ currentPassword: "old" })).toBeNull();
    expect(parsePasswordChange({ currentPassword: "old", nextPassword: "" })).toBeNull();
  });
});

describe("WSL connect input (dialog form schema)", () => {
  it("accepts a complete selection", () => {
    const r = v.safeParse(WslConnectSchema, { distro: "Ubuntu", linuxUser: "utsav", path: "~/notes" });
    expect(r.success).toBe(true);
  });

  it("rejects empty distro, user, or path", () => {
    for (const input of [
      { distro: "", linuxUser: "utsav", path: "~/notes" },
      { distro: "Ubuntu", linuxUser: "", path: "~/notes" },
      { distro: "Ubuntu", linuxUser: "utsav", path: "" },
    ]) {
      expect(v.safeParse(WslConnectSchema, input).success).toBe(false);
    }
  });
});
