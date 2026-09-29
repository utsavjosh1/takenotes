import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { renderMarkdown } from "../../packages/core/src/markdown/render";
import { NoteReadingView } from "../../apps/web/src/components/NotebookPreview";

const DOCS_README = readFileSync(new URL("../../docs/README.md", import.meta.url), "utf8");

describe("docs README renders as normal markdown (not raw source)", () => {
  it("renders headings, fences, tables, links without raw markers", () => {
    const { html } = renderMarkdown(DOCS_README);
    // Normal: structured HTML.
    expect(html).toContain("<h1");
    expect(html).toContain("Docs — takenotes");
    expect(html).toContain("<pre");
    expect(html).toContain("<table");
    expect(html).toContain("<a href=");
    // Not raw: no visible markdown syntax leaking into the view.
    expect(html).not.toContain("```txt");
    expect(html).not.toContain("| Doc |");
    expect(html).not.toContain("# Docs — takenotes");
    expect(html).not.toContain("[architecture.md]");
  });

  it("web reading view shows the normal rendered docs, not raw text", () => {
    const html = renderToStaticMarkup(createElement(NoteReadingView, { text: DOCS_README }));
    expect(html).toContain("<h1");
    expect(html).toContain("<table");
    expect(html).toContain("<pre");
    expect(html).not.toContain("```txt");
    expect(html).not.toContain("| Doc |");
  });

  it("still escapes hostile HTML in the reading view", () => {
    const html = renderToStaticMarkup(
      createElement(NoteReadingView, { text: "# Hi\n\n<script>alert(1)</script>\n" }),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
