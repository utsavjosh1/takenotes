import { describe, expect, it } from "vitest";
import { compareVersions, isNewerRelease, parseChecksumFile, parseVersion, windowsInstallerName } from "../../src/main/update/version";

describe("parseVersion", () => {
  it("parses tags and bare versions", () => {
    expect(parseVersion("v0.2.0")).toEqual({ major: 0, minor: 2, patch: 0 });
    expect(parseVersion("1.10.3")).toEqual({ major: 1, minor: 10, patch: 3 });
  });
  it("rejects prereleases, garbage, non-strings", () => {
    expect(parseVersion("v0.2.0-beta.1")).toBeNull();
    expect(parseVersion("v0.2.0-rc")).toBeNull();
    expect(parseVersion("latest")).toBeNull();
    expect(parseVersion("")).toBeNull();
    expect(parseVersion(null)).toBeNull();
    expect(parseVersion("v1.2")).toBeNull();
  });
});

describe("compareVersions / isNewerRelease", () => {
  it("orders numerically, not lexicographically", () => {
    expect(compareVersions({ major: 0, minor: 9, patch: 0 }, { major: 0, minor: 10, patch: 0 })).toBe(-1);
    expect(compareVersions({ major: 1, minor: 0, patch: 0 }, { major: 1, minor: 0, patch: 0 })).toBe(0);
    expect(compareVersions({ major: 0, minor: 0, patch: 2 }, { major: 0, minor: 0, patch: 10 })).toBe(-1);
  });
  it("offers only strictly newer stable releases", () => {
    expect(isNewerRelease("v0.2.0", "0.0.1")).toBe(true);
    expect(isNewerRelease("v0.0.1", "0.0.1")).toBe(false);
    expect(isNewerRelease("v0.0.1", "0.2.0")).toBe(false);
    expect(isNewerRelease("v0.2.0-beta.1", "0.0.1")).toBe(false);
    expect(isNewerRelease("garbage", "0.0.1")).toBe(false);
    expect(isNewerRelease("v0.2.0", "garbage")).toBe(false);
  });
});

describe("windowsInstallerName", () => {
  it("matches the electron-builder artifact name", () => {
    expect(windowsInstallerName("v0.2.0")).toBe("takenotes-0.2.0-win-x64.exe");
    expect(windowsInstallerName("0.2.0")).toBe("takenotes-0.2.0-win-x64.exe");
  });
});

describe("parseChecksumFile", () => {
  const sums = "abc123  other.txt\n" + "d".repeat(64) + "  takenotes-0.2.0-win-x64.exe\n";
  it("finds text and binary-marker lines", () => {
    expect(parseChecksumFile(sums, "takenotes-0.2.0-win-x64.exe")).toBe("d".repeat(64));
    expect(parseChecksumFile("e".repeat(64) + " *takenotes-0.2.0-win-x64.exe\n", "takenotes-0.2.0-win-x64.exe")).toBe(
      "e".repeat(64),
    );
  });
  it("returns null when absent or malformed", () => {
    expect(parseChecksumFile(sums, "missing.exe")).toBeNull();
    expect(parseChecksumFile("not a sums file", "takenotes-0.2.0-win-x64.exe")).toBeNull();
    expect(parseChecksumFile(null, "x")).toBeNull();
  });
});
