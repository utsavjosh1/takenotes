import { describe, expect, it } from "vitest";
import { validatePosixRelativePath, validateWindowsRelativePath } from "../../src/main/workspace/path-security";

describe("windows path validation", () => {
  it("accepts normal paths", () => {
    expect(validateWindowsRelativePath("notes\\todo.md")).toEqual({ relativePath: "notes\\todo.md" });
    expect(validateWindowsRelativePath("inbox.md")).toEqual({ relativePath: "inbox.md" });
  });

  it("accepts spaces and unicode", () => {
    expect("error" in validateWindowsRelativePath("my notes\\café.md")).toBe(false);
  });

  it("rejects traversal", () => {
    for (const p of ["..\\secret.md", "notes\\..\\..\\x.md", ".."]) {
      expect("error" in validateWindowsRelativePath(p)).toBe(true);
    }
  });

  it("rejects absolute paths and NUL", () => {
    expect("error" in validateWindowsRelativePath("C:\\notes\\x.md")).toBe(true);
    expect("error" in validateWindowsRelativePath("\\\\server\\share")).toBe(true);
    expect("error" in validateWindowsRelativePath("/etc/passwd")).toBe(true);
    expect("error" in validateWindowsRelativePath("a\0b")).toBe(true);
  });

  it("rejects illegal Windows characters and reserved device names", () => {
    expect("error" in validateWindowsRelativePath("a<b.md")).toBe(true);
    expect("error" in validateWindowsRelativePath("a?.md")).toBe(true);
    for (const p of ["CON", "aux.md", "notes\\NUL.txt", "COM1", "LPT9.log"]) {
      expect("error" in validateWindowsRelativePath(p)).toBe(true);
    }
  });
});

describe("posix path validation", () => {
  it("accepts normal paths, spaces, unicode, emoji", () => {
    expect(validatePosixRelativePath("notes/todo.md")).toEqual({ relativePath: "notes/todo.md" });
    expect("error" in validatePosixRelativePath("my notes/café 📝.md")).toBe(false);
  });

  it("rejects traversal and absolute paths", () => {
    for (const p of ["../secret.md", "a/../../x", "/etc/passwd", "..", "a\\b"]) {
      expect("error" in validatePosixRelativePath(p)).toBe(true);
    }
  });

  it("rejects NUL and empty", () => {
    expect("error" in validatePosixRelativePath("")).toBe(true);
    expect("error" in validatePosixRelativePath("a\0b")).toBe(true);
  });
});
