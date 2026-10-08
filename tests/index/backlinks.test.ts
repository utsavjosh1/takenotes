import { describe, expect, it } from "vitest";
import { parseDocument } from "@takenotes/core/index/document";
import { buildEdges } from "@takenotes/core/index/edges";
import {
  backlinksFor,
  linkMentionEdit,
  matchesMentionFilter,
  mentionContext,
  outgoingFor,
  outgoingUnlinked,
  sortMentionRows,
} from "@takenotes/core/links/backlinks";

const REV = (hash: string) => ({ hash, size: 10, mtimeMs: 1 });
const WS = "ws";

/** Fixture vault: aliases, duplicate bare names, embeds, ghosts, and a
 * plain-text mention. Entries come from the real parser. */
function vault() {
  const entries = [
    parseDocument(WS, "Canon.md", "---\naliases: [Cee]\n---\n# Canon\n", REV("h1")),
    parseDocument(WS, "a/Note.md", "# Note\n", REV("h2")),
    parseDocument(WS, "b/Note.md", "# Note\n", REV("h3")),
    parseDocument(
      WS,
      "hub.md",
      "[[Canon|Cee]] [[a/Note]] [[Ghost]] ![[Canon]]\n",
      REV("h4"),
    ),
    parseDocument(WS, "essay.md", "Canon and Cee agree. A note on notes.\n", REV("h5")),
    parseDocument(WS, "quiet.md", "Nothing to see here.\n", REV("h6")),
  ];
  return { entries, edges: buildEdges(entries) };
}

describe("outgoing pane", () => {
  it("lists links, embeds, and unresolved targets for the open note", () => {
    const { edges } = vault();
    expect(outgoingFor(edges, "hub.md")).toEqual([
      { to: "Canon.md", target: "Canon", line: 1, alias: "Cee", embed: false },
      { to: "a/Note.md", target: "a/Note", line: 1, embed: false },
      { to: null, target: "Ghost", line: 1, embed: false },
      { to: "Canon.md", target: "Canon", line: 1, embed: true },
    ]);
  });

  it("is empty for notes that link nowhere", () => {
    const { edges } = vault();
    expect(outgoingFor(edges, "quiet.md")).toEqual([]);
  });
});

describe("backlinks pane", () => {
  it("finds linked mentions with alias and embed detail", () => {
    const { entries, edges } = vault();
    const { linked } = backlinksFor(edges, entries, "Canon.md");
    expect(linked).toEqual([
      { from: "hub.md", line: 1, alias: "Cee", embed: false },
      { from: "hub.md", line: 1, embed: true },
    ]);
  });

  it("finds unlinked mentions alias-aware, skipping linked and quiet notes", () => {
    const { entries, edges } = vault();
    const { linked, unlinked } = backlinksFor(edges, entries, "Canon.md");
    expect(linked.map((l) => l.from)).not.toContain("essay.md");
    // Longest name match wins: "Canon" (5) beats "Cee" (3).
    expect(unlinked).toEqual([{ from: "essay.md", matchedText: "Canon" }]);
  });

  it("duplicate names each get their own backlinks; shared mentions stay unlinked for both", () => {
    const { entries, edges } = vault();
    const a = backlinksFor(edges, entries, "a/Note.md");
    const b = backlinksFor(edges, entries, "b/Note.md");
    expect(a.linked).toEqual([{ from: "hub.md", line: 1, embed: false }]);
    expect(b.linked).toEqual([]);
    // essay.md mentions "note" but links to neither duplicate. hub.md
    // links a/Note.md, yet its source still contains the bare name "Note"
    // without linking b/Note.md — a genuine unlinked mention of b.
    expect(a.unlinked).toEqual([{ from: "essay.md", matchedText: "Note" }]);
    expect(b.unlinked).toEqual([
      { from: "essay.md", matchedText: "Note" },
      { from: "hub.md", matchedText: "Note" },
    ]);
  });

  it("unknown targets yield empty panes", () => {
    const { entries, edges } = vault();
    expect(backlinksFor(edges, entries, "Ghost.md")).toEqual({ linked: [], unlinked: [] });
  });
});

describe("outgoing unlinked mentions", () => {
  it("mirrors backlinks detection for the active note's text", () => {
    const { entries, edges } = vault();
    // essay.md links nowhere; its text names Canon (+alias Cee) and "note".
    expect(outgoingUnlinked(edges, entries, "essay.md")).toEqual([
      { to: "Canon.md", matchedText: "Canon" },
      { to: "a/Note.md", matchedText: "Note" },
      { to: "b/Note.md", matchedText: "Note" },
    ]);
  });

  it("skips linked targets but surfaces ambiguous duplicates", () => {
    const { entries, edges } = vault();
    // hub.md links a/Note.md yet still names "Note" without linking b/Note.md.
    expect(outgoingUnlinked(edges, entries, "hub.md")).toEqual([{ to: "b/Note.md", matchedText: "Note" }]);
  });

  it("is empty for unknown notes", () => {
    const { entries, edges } = vault();
    expect(outgoingUnlinked(edges, entries, "Ghost.md")).toEqual([]);
  });
});

describe("mention sort + filter", () => {
  it("sorts by name asc or mtime desc without mutating", () => {
    const rows = [{ from: "b.md", line: 1 }, { from: "a.md", line: 2 }];
    const entries = [
      parseDocument(WS, "a.md", "A\n", { hash: "h", size: 1, mtimeMs: 5 }),
      parseDocument(WS, "b.md", "B\n", { hash: "h", size: 1, mtimeMs: 9 }),
    ];
    expect(sortMentionRows(rows, entries, "name", (r) => r.from).map((r) => r.from)).toEqual(["a.md", "b.md"]);
    expect(sortMentionRows(rows, entries, "modified", (r) => r.from).map((r) => r.from)).toEqual(["b.md", "a.md"]);
    expect(rows.map((r) => r.from)).toEqual(["b.md", "a.md"]);
    // Outgoing rows key on `to`.
    const out = [{ to: "b.md" }, { to: "a.md" }];
    expect(sortMentionRows(out, entries, "name", (o) => o.to).map((o) => o.to)).toEqual(["a.md", "b.md"]);
  });

  it("filters on every token over path + title", () => {
    const entry = parseDocument(WS, "projects/Plan.md", "# Fancy\n", REV("h"));
    expect(matchesMentionFilter({ from: "projects/Plan.md" }, "", entry)).toBe(true);
    expect(matchesMentionFilter({ from: "projects/Plan.md" }, "plan", entry)).toBe(true);
    expect(matchesMentionFilter({ from: "projects/Plan.md" }, "fancy", entry)).toBe(true);
    expect(matchesMentionFilter({ from: "projects/Plan.md" }, "plan fancy", entry)).toBe(true);
    expect(matchesMentionFilter({ from: "projects/Plan.md" }, "plan zzz", entry)).toBe(false);
    expect(matchesMentionFilter({ from: "projects/Plan.md" }, "zzz", undefined)).toBe(false);
  });
});

describe("mention context", () => {
  it("shows the linked source line", () => {
    const { entries } = vault();
    expect(mentionContext(entries, { from: "hub.md", line: 1 })).toBe("[[Canon|Cee]] [[a/Note]] [[Ghost]] ![[Canon]]");
  });

  it("shows the first mentioning line for unlinked rows", () => {
    const { entries } = vault();
    expect(mentionContext(entries, { from: "essay.md", matchedText: "Canon" })).toBe("Canon and Cee agree. A note on notes.");
  });

  it("returns null for unknown notes and out-of-range lines", () => {
    const { entries } = vault();
    expect(mentionContext(entries, { from: "Ghost.md", line: 1 })).toBeNull();
    expect(mentionContext(entries, { from: "hub.md", line: 99 })).toBeNull();
    expect(mentionContext(entries, { from: "hub.md" })).toBeNull();
  });
});

describe("linkMentionEdit ([[Canon|Alias]] conversion)", () => {
  const FMT = "shortest" as const;

  it("converts the first body occurrence, preserving actual casing", () => {
    expect(linkMentionEdit("Canon and Cee agree.\n", "Cee", "Canon.md", "essay.md", FMT, true)).toEqual({
      content: "Canon and [[Canon|Cee]] agree.\n",
      line: 1,
    });
  });

  it("matches case-insensitively and labels with source casing", () => {
    expect(linkMentionEdit("loves canon law\n", "Canon", "Canon.md", "essay.md", FMT, true)?.content).toBe(
      "loves [[Canon|canon]] law\n",
    );
  });

  it("never touches frontmatter, fences, or existing [[links]]", () => {
    const content = "---\ntitle: Canon\n---\n```\nCanon\n```\n[[Other|Canon X]] and Canon\n";
    expect(linkMentionEdit(content, "Canon", "Canon.md", "n.md", FMT, true)).toEqual({
      content: "---\ntitle: Canon\n---\n```\nCanon\n```\n[[Other|Canon X]] and [[Canon|Canon]]\n",
      line: 7,
    });
  });

  it("writes Markdown links when wikilinks are off, honoring format", () => {
    expect(linkMentionEdit("See Cee here\n", "Cee", "Canon.md", "essay.md", FMT, false)?.content).toBe(
      "See [Cee](Canon.md) here\n",
    );
    expect(linkMentionEdit("See Cee here\n", "Cee", "docs/Canon.md", "essay.md", "absolute", false)?.content).toBe(
      "See [Cee](docs/Canon.md) here\n",
    );
  });

  it("returns null when nothing converts", () => {
    expect(linkMentionEdit("quiet here\n", "Canon", "Canon.md", "n.md", FMT, true)).toBeNull();
    expect(linkMentionEdit("Canon\n", "  ", "Canon.md", "n.md", FMT, true)).toBeNull();
    expect(linkMentionEdit("```\nCanon\n```\n", "Canon", "Canon.md", "n.md", FMT, true)).toBeNull();
  });
});
