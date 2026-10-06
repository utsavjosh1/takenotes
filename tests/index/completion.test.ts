import { describe, expect, it } from "vitest";
import { parseDocument } from "@takenotes/core/index/document";
import {
  fileCandidates,
  formatWikilink,
  headingCandidates,
  parseWikilinkContext,
} from "@takenotes/core/links/completion";

const REV = (hash: string) => ({ hash, size: 10, mtimeMs: 1 });
const WS = "ws";

describe("formatWikilink", () => {
  it.each([
    ["shortest", "Note.md", "hub.md", "Note"],
    ["shortest", "projects/Plan.md", "hub.md", "Plan"],
    ["shortest", "projects/Plan.md", "projects/Other.md", "Plan"],
    ["relative", "Note.md", "hub.md", "Note"],
    ["relative", "projects/Plan.md", "hub.md", "projects/Plan"],
    ["relative", "projects/Plan.md", "projects/Other.md", "Plan"],
    ["relative", "hub.md", "projects/Other.md", "../hub"],
    ["relative", "a/b/C.md", "a/D.md", "b/C"],
    ["absolute", "projects/Plan.md", "hub.md", "projects/Plan"],
    ["absolute", "projects/Plan.md", "projects/Other.md", "projects/Plan"],
    ["absolute", "Note.md", "a/b/C.md", "Note"],
  ] as const)("(%s) %s from %s → %s", (format, target, from, expected) => {
    expect(formatWikilink(target, from, format)).toBe(expected);
  });

  it("strips markdown extensions only", () => {
    expect(formatWikilink("a/Note.markdown", "hub.md", "shortest")).toBe("Note");
    expect(formatWikilink("a/Note.txt", "hub.md", "shortest")).toBe("Note");
  });
});

describe("fileCandidates", () => {
  it("labels basenames, subtitles folders, sorts by path, skips non-notes", () => {
    const entries = [
      parseDocument(WS, "hub.md", "# H\n", REV("h1")),
      parseDocument(WS, "projects/Note.md", "# N\n", REV("h2")),
      parseDocument(WS, "archive/Note.md", "# N\n", REV("h3")),
      parseDocument(WS, "img.png", "binary", REV("h4")),
    ];
    expect(fileCandidates(entries)).toEqual([
      { path: "archive/Note.md", name: "Note", sub: "archive", title: "N" },
      { path: "hub.md", name: "hub", sub: "", title: "H" },
      { path: "projects/Note.md", name: "Note", sub: "projects", title: "N" },
    ]);
  });
});

describe("headingCandidates", () => {
  it("follows index order with levels", () => {
    const e = parseDocument(WS, "n.md", "# A\n## B\n### C\n", REV("h1"));
    expect(headingCandidates(e)).toEqual([
      { text: "A", level: 1 },
      { text: "B", level: 2 },
      { text: "C", level: 3 },
    ]);
  });
});

describe("parseWikilinkContext", () => {
  it.each([
    ["[[No", { kind: "file", start: 0, frag: "No", embed: false }],
    ["see [[a/Note", { kind: "file", start: 4, frag: "a/Note", embed: false }],
    ["[[", { kind: "file", start: 0, frag: "", embed: false }],
    ["![[pic", { kind: "file", start: 0, frag: "pic", embed: true }],
    ["[[Note#Hea", { kind: "heading", start: 0, fileFrag: "Note", headFrag: "Hea", embed: false }],
    ["[[a/Note#", { kind: "heading", start: 0, fileFrag: "a/Note", headFrag: "", embed: false }],
    ["x [[a]] y [[b", { kind: "file", start: 10, frag: "b", embed: false }],
  ] as const)("%s → %j", (before, expected) => {
    expect(parseWikilinkContext(before)).toEqual(expected);
  });

  it.each([["[[Note|"], ["[[Note|al"], ["[[closed]] "], ["plain text"], ["[[a#b]] "], [""]])(
    "%s completes nothing",
    (before) => {
      expect(parseWikilinkContext(before)).toBeNull();
    },
  );
});
