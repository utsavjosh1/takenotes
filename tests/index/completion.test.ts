import { describe, expect, it } from "vitest";
import { parseDocument } from "@takenotes/core/index/document";
import {
  aliasCandidates,
  blockCandidates,
  fileCandidates,
  formatMarkdownLink,
  formatWikilink,
  headingCandidates,
  parseWikilinkContext,
  resolveCreationPath,
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

describe("blockCandidates", () => {
  it("merges trailing ^ids and task anchors in source order", () => {
    const e = parseDocument(
      WS,
      "n.md",
      ["# A ^head-blk", "para one ^p1", "- [ ] task @due(2026-01-02) ^t1", "- plain ^p2", "```", "code ^nope", "```"].join("\n"),
      REV("h1"),
    );
    // Heading text stays clean while its block id is still completable.
    expect(e.headings.map((h) => h.text)).toEqual(["A"]);
    expect(blockCandidates(e)).toEqual([
      { id: "head-blk", line: 1 },
      { id: "p1", line: 2 },
      { id: "t1", line: 3 },
      { id: "p2", line: 4 },
    ]);
  });

  it("ignores fenced ^ids and mid-line carets", () => {
    const e = parseDocument(WS, "n.md", ["a ^b c", "^lonely", "x"].join("\n"), REV("h1"));
    expect(blockCandidates(e)).toEqual([]);
  });
});

describe("aliasCandidates", () => {
  it("offers titles and frontmatter aliases, skipping bare-name echoes", () => {
    const entries = [
      parseDocument(WS, "projects/Note.md", "---\naliases: [NB, Note]\n---\n# Fancy Title\n", REV("h1")),
      parseDocument(WS, "hub.md", "# Hub\n", REV("h2")),
    ];
    // "Hub" echoes its own basename (already a file option) so it is skipped.
    expect(aliasCandidates(entries)).toEqual([
      { alias: "Fancy Title", path: "projects/Note.md", name: "Note", sub: "projects" },
      { alias: "NB", path: "projects/Note.md", name: "Note", sub: "projects" },
    ]);
  });
});

describe("formatMarkdownLink", () => {
  it.each([
    ["Note.md", "Note", "hub.md", "shortest", "[Note](Note.md)"],
    ["projects/Plan.md", "Plan", "hub.md", "shortest", "[Plan](Plan.md)"],
    ["projects/Plan.md", "Plan", "hub.md", "relative", "[Plan](projects/Plan.md)"],
    ["projects/Plan.md", "Plan", "projects/Other.md", "relative", "[Plan](Plan.md)"],
    ["projects/Plan.md", "Fancy", "hub.md", "absolute", "[Fancy](projects/Plan.md)"],
    ["My Notes/Old Note.md", "Old Note", "hub.md", "shortest", "[Old Note](Old%20Note.md)"],
    ["projects/Note.md", "NB", "hub.md", "shortest", "[NB](Note.md)"],
    ["notes/Log.txt", "Log", "hub.md", "shortest", "[Log](Log.txt)"],
  ] as const)("%s as %s from %s (%s) → %s", (target, label, from, format, expected) => {
    expect(formatMarkdownLink(target, label, from, format)).toBe(expected);
  });

  it("encodes # so the url never parses as a fragment", () => {
    expect(formatMarkdownLink("A#B.md", "A#B", "hub.md", "shortest")).toBe("[A#B](A%23B.md)");
  });
});

describe("resolveCreationPath", () => {
  it.each([
    // [rawTarget, fromPath, expected]
    ["Note", "hub.md", "Note.md"],
    ["Note", "projects/Other.md", "projects/Note.md"],
    ["Note.md", "projects/Other.md", "projects/Note.md"],
    ["Docs/Note", "projects/Other.md", "Docs/Note.md"],
    ["Docs/Note.txt", "hub.md", "Docs/Note.txt"],
    ["Note#Heading", "projects/Other.md", "projects/Note.md"],
    ["Docs/Note#^blk", "hub.md", "Docs/Note.md"],
    ["a/./Note", "hub.md", "a/Note.md"],
  ] as const)("%s from %s → %s", (target, from, expected) => {
    expect(resolveCreationPath(target, from)).toBe(expected);
  });

  it.each([["", "hub.md"], ["   ", "hub.md"], ["../Escape", "a/b.md"], ["a/../../Escape", "hub.md"], ["/abs/Note", "hub.md"], ["pic.png", "hub.md"], ["Doc.pdf", "hub.md"], ["#Heading", "hub.md"]])(
    "%s from %s refuses",
    (target, from) => {
      expect(resolveCreationPath(target, from)).toBeNull();
    },
  );
});

describe("parseWikilinkContext", () => {
  it.each([
    ["[[No", { kind: "file", start: 0, frag: "No", embed: false }],
    ["see [[a/Note", { kind: "file", start: 4, frag: "a/Note", embed: false }],
    ["[[", { kind: "file", start: 0, frag: "", embed: false }],
    ["![[pic", { kind: "file", start: 0, frag: "pic", embed: true }],
    ["[[Note#Hea", { kind: "heading", start: 0, fileFrag: "Note", headFrag: "Hea", embed: false }],
    ["[[a/Note#", { kind: "heading", start: 0, fileFrag: "a/Note", headFrag: "", embed: false }],
    ["[[Note#^bl", { kind: "block", start: 0, fileFrag: "Note", blockFrag: "bl", embed: false }],
    ["[[a/Note#^", { kind: "block", start: 0, fileFrag: "a/Note", blockFrag: "", embed: false }],
    ["![[Note#^bl", { kind: "block", start: 0, fileFrag: "Note", blockFrag: "bl", embed: true }],
    ["[[#^bl", { kind: "block", start: 0, fileFrag: "", blockFrag: "bl", embed: false }],
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
