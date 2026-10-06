import { describe, expect, it } from "vitest";
import {
  extractAtxHeadings,
  lineForBlockId,
  lineForHeadingFragment,
  previewExcerpt,
} from "@takenotes/core/outline/extract";

/** Step 2 slice 7 gate: live ATX outline, anchor lines, preview excerpts. */
describe("step2 outline", () => {
  it("extracts ATX 1–6 with lines, skips fences and Setext", () => {
    const text = "# Title\n\nSome text\n\n```\n# not a heading\n```\n\n## Sub {#x}\n\n~~~md\n## hidden\n~~~\n\nplain\n===\n\n### Deep ###\n";
    const headings = extractAtxHeadings(text);
    expect(headings.map((h) => [h.text, h.level, h.line])).toEqual([
      ["Title", 1, 1],
      ["Sub {#x}", 2, 9],
      ["Deep", 3, 18],
    ]);
  });

  it("handles BOM/CRLF and dedupes anchors", () => {
    const headings = extractAtxHeadings("﻿# Dup\r\n\r\n# Dup\r\n");
    expect(headings.map((h) => [h.anchor, h.line])).toEqual([["dup", 1], ["dup-1", 3]]);
  });

  it("ignores empty and hash-only lines", () => {
    expect(extractAtxHeadings("#\n#   \ntext\n")).toEqual([]);
  });

  it("finds heading lines by anchor or text", () => {
    const text = "# Hello World\n\n## Getting Started\n";
    expect(lineForHeadingFragment(text, "hello-world")).toBe(1);
    expect(lineForHeadingFragment(text, "Getting Started")).toBe(3);
    expect(lineForHeadingFragment(text, "Hello%20World")).toBe(1);
    expect(lineForHeadingFragment(text, "nope")).toBeNull();
  });

  it("finds block-id lines with or without caret", () => {
    const text = "para one ^a1\n\n- item ^b-2\n";
    expect(lineForBlockId(text, "^a1")).toBe(1);
    expect(lineForBlockId(text, "b-2")).toBe(3);
    expect(lineForBlockId(text, "zzz")).toBeNull();
  });

  it("caps excerpts at 20 lines by default", () => {
    const text = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join("\n");
    const excerpt = previewExcerpt(text);
    expect(excerpt.split("\n")).toHaveLength(20);
    expect(previewExcerpt("short")).toBe("short");
  });
});
