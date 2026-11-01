import { describe, expect, it } from "vitest";
import {
  describeOpenFolderError, lockoutMessage, normalizeServerAddress, parsePairLink, SignInLockout, stepStatuses, validateWorkspaceName,
} from "@takenotes/core/workspace/onboarding";

describe("validateWorkspaceName", () => {
  it("accepts good names and explains bad ones", () => {
    expect(validateWorkspaceName("My notes", ["Other"])).toBeNull();
    expect(validateWorkspaceName("  ", [])).toMatch(/name/);
    for (const c of ["a/b", "a\\b", "a:b", "a*b", "a?b", 'a"b', "a<b", "a>b", "a|b"]) expect(validateWorkspaceName(c, [])).toMatch(/can’t contain/);
    expect(validateWorkspaceName("my NOTES", ["My Notes"])).toMatch(/already exists/);
    expect(validateWorkspaceName("CON", [])).not.toBeNull();
  });
});

describe("SignInLockout", () => {
  const mem = () => { let v: string | null = null; return { get: () => v, set: (s: string) => { v = s; } }; };
  it("locks for 30 s after three failures, counts down, and survives a reload", () => {
    const store = mem(); let t = 1_000_000;
    const a = new SignInLockout(store, () => t);
    expect(a.recordFailure()).toEqual({ locked: false, attemptsLeft: 2 });
    expect(a.recordFailure()).toEqual({ locked: false, attemptsLeft: 1 });
    expect(a.recordFailure().locked).toBe(true);
    expect(a.secondsLeft()).toBe(30);
    t += 6_000;
    const reloaded = new SignInLockout(store, () => t);
    expect(reloaded.secondsLeft()).toBe(24);
    expect(lockoutMessage(reloaded.secondsLeft())).toBe("Too many attempts. Try again in 24 s.");
    t += 25_000;
    expect(reloaded.secondsLeft()).toBe(0);
    expect(reloaded.recordFailure().attemptsLeft).toBe(2);
  });
  it("success clears failures", () => {
    const l = new SignInLockout(mem());
    l.recordFailure(); l.recordSuccess();
    expect(l.recordFailure().attemptsLeft).toBe(2);
  });
});

describe("pairing and addresses", () => {
  it("previews a valid link and rejects others", () => {
    expect(parsePairLink("takenotes://pair?server=http://127.0.0.1:3001&name=Debian%20dev")).toEqual({ server: "http://127.0.0.1:3001", name: "Debian dev" });
    expect(parsePairLink("takenotes://pair?server=javascript:alert(1)")).toBeNull();
    expect(parsePairLink("https://example.com")).toBeNull();
    expect(parsePairLink("nonsense")).toBeNull();
  });
  it("normalizes server addresses", () => {
    expect(normalizeServerAddress("https://notes.home.arpa:3000/x")).toBe("https://notes.home.arpa:3000");
    expect(normalizeServerAddress("ftp://x")).toBeNull();
    expect(normalizeServerAddress("https://u:p@x.com")).toBeNull();
  });
});

describe("plain-words errors and wizard", () => {
  it("permission error reads plainly and keeps the technical text in details", () => {
    const e = describeOpenFolderError("PERMISSION_DENIED", "EACCES: /root");
    expect(e.cause).toBe("takenotes does not have permission to read this folder.");
    expect(e.details).toContain("EACCES");
    expect(e.action).toBe("Choose another folder");
  });
  it("step statuses", () => {
    expect(stepStatuses("install", "working")).toEqual(["done", "working", "pending", "pending"]);
    expect(stepStatuses("install", "failed")).toEqual(["done", "failed", "pending", "pending"]);
  });
});
