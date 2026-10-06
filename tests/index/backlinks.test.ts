import { describe, expect, it } from "vitest";
import { parseDocument } from "@takenotes/core/index/document";
import { buildEdges } from "@takenotes/core/index/edges";
import { backlinksFor, outgoingFor } from "@takenotes/core/links/backlinks";

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
