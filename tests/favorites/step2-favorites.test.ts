import { describe, expect, it } from "vitest";
import {
  addEntry,
  addGroup,
  deleteGroup,
  emptyFavoritesDoc,
  moveEntry,
  parseFavoritesDoc,
  removeEntry,
  renameGroup,
  serializeFavoritesDoc,
  setEntryAlias,
  splitAnchorTarget,
} from "@takenotes/core/favorites/store";

/** Step 2 slice 6 gate: traveling favorites doc, validation, mutations. */
describe("step2 favorites", () => {
  it("round-trips yaml and rejects bad entries without losing good ones", () => {
    const { doc, errors } = parseFavoritesDoc(`
version: 1
groups:
  - name: default
    entries:
      - {type: file, target: "Projects/Note.md"}
      - {type: bogus, target: "x"}
      - {type: file, target: "../escape.md"}
      - {type: search, target: "tag:#todo"}
      - {type: heading, target: "Note.md#Intro"}
      - {type: block, target: "Note.md#^abc-123"}
      - {type: block, target: "Note.md#no-caret"}
`);
    expect(doc.groups[0]?.entries.map((e) => e.target)).toEqual([
      "Projects/Note.md",
      "tag:#todo",
      "Note.md#Intro",
      "Note.md#^abc-123",
    ]);
    expect(errors.length).toBeGreaterThan(0);
    const back = parseFavoritesDoc(serializeFavoritesDoc(doc));
    expect(back.doc).toEqual(doc);
    expect(back.errors).toEqual([]);
  });

  it("falls back to empty on invalid YAML instead of destroying content", () => {
    const { doc, errors } = parseFavoritesDoc("{ oops: [unclosed");
    expect(doc).toEqual(emptyFavoritesDoc());
    expect(errors.length).toBe(1);
  });

  it("mutates groups and entries purely", () => {
    let doc = emptyFavoritesDoc();
    doc = addGroup(doc, "work");
    expect(doc.groups.map((g) => g.name)).toEqual(["default", "work"]);
    doc = addGroup(doc, "work");
    expect(doc.groups).toHaveLength(2);
    doc = addEntry(doc, "work", { type: "file", target: "a.md" });
    doc = addEntry(doc, "work", { type: "file", target: "a.md" });
    expect(doc.groups[1]?.entries).toHaveLength(1);
    doc = addEntry(doc, "work", { type: "file", target: "b.md" });
    doc = moveEntry(doc, "work", 1, 0);
    expect(doc.groups[1]?.entries.map((e) => e.target)).toEqual(["b.md", "a.md"]);
    doc = setEntryAlias(doc, "work", 0, "Bee");
    expect(doc.groups[1]?.entries[0]?.alias).toBe("Bee");
    doc = removeEntry(doc, "work", 0);
    expect(doc.groups[1]?.entries.map((e) => e.target)).toEqual(["a.md"]);
    doc = renameGroup(doc, "work", "job");
    expect(doc.groups[1]?.name).toBe("job");
    doc = deleteGroup(doc, "default");
    expect(doc.groups.map((g) => g.name)).toEqual(["job"]);
    // Last group is protected.
    expect(deleteGroup(doc, "job").groups).toHaveLength(1);
  });

  it("splits anchor targets", () => {
    expect(splitAnchorTarget("Note.md#Intro")).toEqual({ rel: "Note.md", frag: "Intro" });
    expect(splitAnchorTarget("Note.md#^a1")).toEqual({ rel: "Note.md", frag: "^a1" });
    expect(splitAnchorTarget("plain.md")).toBeNull();
  });
});
