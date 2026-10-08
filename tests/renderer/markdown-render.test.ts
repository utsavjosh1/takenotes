import { describe, expect, it } from "vitest";
import { renderMarkdown, toggleTaskCheckboxAtLine } from "../../apps/desktop/src/renderer/markdown/render";

describe("reading view markdown renderer", () => {
  it("escapes hostile html while rendering common markdown", () => {
    const html = renderMarkdown(`# Title\n\nHello **world** <script>alert(1)</script>\n\n> [!note] Heads up\n> Body\n`).html;
    expect(html).toContain("<h1");
    expect(html).toContain("<strong>world</strong>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("md-callout-note");
  });

  it("renders task checkboxes with stable source line numbers", () => {
    const html = renderMarkdown("Intro\n- [ ] todo\n- [x] done\n").html;
    expect(html).toContain('data-line="2"');
    expect(html).toContain('data-line="3" checked');
  });

  it("toggles only the checkbox marker for one task line", () => {
    expect(toggleTaskCheckboxAtLine("# T\n- [ ] todo @due(2026-01-01)\n", 2)).toBe("# T\n- [x] todo @due(2026-01-01)\n");
    expect(toggleTaskCheckboxAtLine("# T\n- [x] todo\n", 2)).toBe("# T\n- [ ] todo\n");
    expect(toggleTaskCheckboxAtLine("plain\n", 1)).toBeNull();
  });

  it("treats any non-space task marker as done", () => {
    const html = renderMarkdown("- [ ] open\n- [x] done\n- [-] dropped\n- [*] starred\n").html;
    expect(html).not.toContain('data-line="1" checked');
    expect(html).toContain('data-line="2" checked');
    expect(html).toContain('data-line="3" checked');
    expect(html).toContain('data-line="4" checked');
    expect(toggleTaskCheckboxAtLine("- [-] dropped\n", 1)).toBe("- [ ] dropped\n");
  });

  it("renders explicit and inline footnotes", () => {
    const res = renderMarkdown("Body[^a] and inline^[quick note].\n\n[^a]: explicit def\n");
    expect(res.html).toContain('href="#fn-a"');
    expect(res.html).toContain('href="#fn-inline-1"');
    expect(res.html).toContain('id="fn-a"');
    expect(res.html).toContain('id="fn-inline-1"');
    expect(res.html).toContain("explicit def");
    expect(res.html).toContain("quick note");
    expect(res.footnotes).toEqual(["a", "inline-1"]);
  });

  it("renders inline footnote markdown in the footnote body", () => {
    const html = renderMarkdown("Hi^[a **bold** link].\n").html;
    expect(html).toContain("<strong>bold</strong>");
  });

  it("nests callouts and folds +/- with default-to-note", () => {
    const nested = renderMarkdown("> [!note] Outer\n> > [!warning] Inner\n> > inner body\n> outer body\n").html;
    expect(nested).toContain("md-callout-note");
    expect(nested).toContain("md-callout-warning");
    expect(nested).toContain("inner body");
    expect(nested).toContain("outer body");

    const open = renderMarkdown("> [!tip]+ Fold title\n> body\n").html;
    expect(open).toContain("<details open>");
    expect(open).toContain("<summary");

    const shut = renderMarkdown("> [!tip]- Fold title\n> body\n").html;
    expect(shut).toContain("<details>");
    expect(shut).not.toContain("<details open>");

    const unknown = renderMarkdown("> [!madeup] T\n> body\n").html;
    expect(unknown).toContain("md-callout-note");
    expect(unknown).toContain('data-callout="madeup"');
  });

  it("parses GFM table edge cases", () => {
    const single = renderMarkdown("| H |\n|---|\n| a |\n").html;
    expect(single).toContain("<table ");
    expect(single).toContain("<th>H</th>");
    expect(single).toContain("<td>a</td>");

    const align = renderMarkdown("| L | C | R |\n| :--- | :---: | ---: |\n| a | b | c |\n").html;
    expect(align).toContain('<th align="left">L</th>');
    expect(align).toContain('<th align="center">C</th>');
    expect(align).toContain('<th align="right">R</th>');

    const escaped = renderMarkdown("| A | B |\n|---|---|\n| x \\| y | z |\n").html;
    expect(escaped).toContain("<td>x | y</td>");

    const missing = renderMarkdown("| A | B | C |\n|---|---|---|\n| only |\n").html;
    expect(missing).toContain("<td>only</td>");
    expect(missing).toContain("<td></td>");
  });

  it("renders local relative images and blocks hostile schemes", () => {
    for (const src of ["images/pic.png", "./a.png", "../assets/a.png", "note%20name.png", "https://example.com/x.png"]) {
      const html = renderMarkdown(`![alt](${src})`).html;
      expect(html).toContain(`<img src="${src}"`);
    }
    const evil = renderMarkdown("![x](javascript:alert(1))").html;
    expect(evil).not.toContain("javascript:");
    expect(evil).toContain('<img src="#"');
    const spaced = renderMarkdown("![alt](<path with spaces.png>)").html;
    expect(spaced).toContain('<img src="path with spaces.png"');
  });

  it("nests unordered and ordered lists by indentation", () => {
    const html = renderMarkdown("- a\n  - b\n    - c\n- d\n").html;
    expect(html).toContain("<li data-line=\"1\">a<ul>");
    expect(html).toContain("<li data-line=\"3\">c</li>");

    const ordered = renderMarkdown("1. one\n   1. sub\n2. two\n").html;
    expect(ordered).toContain("<ol>");
    expect(ordered).toContain("<li data-line=\"2\">sub</li>");

    const taskNest = renderMarkdown("- [ ] parent\n  - [x] child\n").html;
    expect(taskNest).toContain('data-line="1"');
    expect(taskNest).toContain('data-line="2" checked');
  });

  it("strips %%comments%% including multiline", () => {
    const html = renderMarkdown("a %%drop\nme%% b\n").html;
    expect(html).not.toContain("drop");
    expect(html).toContain("a");
    expect(html).toContain("b");
  });

  it("never leaks code-stash placeholders into reading view", () => {
    // Mirrors the SECURITY.md-style real-world case: code spans holding
    // underscores/bold markers must render verbatim with no placeholder
    // residue and no emphasis mangling.
    const html = renderMarkdown("Renderer: `workspace_id`, `a_b`, `**not bold**`.\n\nText with `x_1_y` and **bold** plus `[^a]` literal.\n").html;
    expect(html).not.toContain("TAKENOTES");
    expect(html).not.toContain("@@");
    expect(html).toContain("<code>workspace_id</code>");
    expect(html).toContain("<code>a_b</code>");
    expect(html).toContain("<code>**not bold**</code>");
    expect(html).toContain("<code>x_1_y</code>");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("keeps %% and footnote markers inside code spans literal", () => {
    const res = renderMarkdown("A `a %% b` c `^[x]` d.\n");
    expect(res.html).toContain("<code>a %% b</code>");
    expect(res.html).toContain("<code>^[x]</code>");
    expect(res.footnotes).toEqual([]);
  });

  it("tags blocks with source lines for click-to-edit mapping", () => {
    const html = renderMarkdown("# H\n\nPara text\n\n- item\n\n| A |\n|---|\n| v |\n").html;
    expect(html).toContain('<h1 data-line="1"');
    expect(html).toContain('<p data-line="3"');
    expect(html).toContain('<li data-line="5"');
    expect(html).toContain('<table data-line="7"');
  });

  it("does not render markdown inside HTML blocks", () => {
    const html = renderMarkdown("<div>\n# not a heading\n- not a list\n</div>\n").html;
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("<ul>");
    expect(html).toContain("&lt;div&gt;");
  });

  it("renders thematic breaks and setext headings", () => {
    expect(renderMarkdown("a\n\n***\n\nb\n").html).toContain("<hr");
    expect(renderMarkdown("a\n\n---\n\nb\n").html).toContain("<hr");
    expect(renderMarkdown("a\n\n_ _ _\n\nb\n").html).toContain("<hr");
    // Setext underline directly after paragraph text (not a break).
    const h1 = renderMarkdown("Big Title\n===\n").html;
    expect(h1).toContain("<h1");
    expect(h1).toContain("Big Title");
    expect(h1).not.toContain("<hr");
    const h2 = renderMarkdown("Section\n---\n").html;
    expect(h2).toContain("<h2");
    expect(h2).toContain("Section");
    expect(h2).not.toContain("<hr");
    // Multi-line setext content joins.
    expect(renderMarkdown("line one\nline two\n===\n").html).toContain("<h1");
  });

  it("resolves reference links with titles and first-definition-wins", () => {
    const md = "See [docs][ref] and [plain][] plus [shortcut].\n\n[ref]: https://example.com/guide \"Guide title\"\n[plain]: ./local.md\n[shortcut]: <path with spaces.md>\n";
    const html = renderMarkdown(md).html;
    expect(html).toContain('<a href="https://example.com/guide" title="Guide title"');
    expect(html).toContain('<a href="./local.md"');
    expect(html).toContain('<a href="path with spaces.md"');
    expect(html).not.toContain("[ref]:");
    // Unknown labels stay literal; footnote defs are not link defs.
    const other = renderMarkdown("A [missing] ref[^n].\n\n[^n]: note\n").html;
    expect(other).toContain("[missing]");
    expect(other).toContain('href="#fn-n"');
  });

  it("linkifies autolinks and mail addresses", () => {
    const html = renderMarkdown("Visit <https://example.com/x> or <me@example.com>.\n").html;
    expect(html).toContain('<a href="https://example.com/x"');
    expect(html).toContain('<a href="mailto:me@example.com"');
    expect(html).not.toContain("&lt;https");
  });

  it("keeps link and image titles", () => {
    const html = renderMarkdown('[t](https://example.com "Cap") and ![a](./i.png "Pic")\n').html;
    expect(html).toContain('title="Cap"');
    expect(html).toContain('title="Pic"');
  });

  it("renders indented code blocks but keeps lazy paragraph continuation", () => {
    const code = renderMarkdown("para\n\n    indented();\n\nmore\n").html;
    expect(code).toContain("<pre");
    expect(code).toContain("indented();");
    // Indented line directly under text is a lazy continuation, not code.
    const lazy = renderMarkdown("foo\n    bar\n").html;
    expect(lazy).not.toContain("<pre");
    expect(lazy).toContain("foo");
  });

  it("renders audio/video/pdf attachments beyond plain img", () => {
    expect(renderMarkdown("![a](clip.mp3)").html).toContain('<audio controls src="clip.mp3"');
    expect(renderMarkdown("![v](movie.mp4)").html).toContain('<video controls preload="metadata" src="movie.mp4"');
    expect(renderMarkdown("![d](doc.pdf)").html).toContain('<embed src="doc.pdf" type="application/pdf"');
    // Images stay <img>, hostile schemes stay neutralized.
    expect(renderMarkdown("![i](pic.png)").html).toContain("<img");
    expect(renderMarkdown("![x](javascript:alert(1))").html).toContain('<img src="#"');
    // Wikilink embeds: media inline, notes stay resolvable anchors.
    const emb = renderMarkdown("![[clip.mp3]] ![[movie.mp4]] ![[doc.pdf]] ![[Note]]\n").html;
    expect(emb).toContain("<audio");
    expect(emb).toContain('data-wikilink="clip.mp3"');
    expect(emb).toContain("<video");
    expect(emb).toContain("<embed");
    expect(emb).toContain('data-wikilink="Note"');
  });

  it("honors embed dimensions and PDF viewer params", () => {
    // Sized image embeds render <img> with width/height.
    expect(renderMarkdown("![[pic.png|100]]\n").html).toContain('<img src="pic.png" alt="pic.png" width="100"');
    expect(renderMarkdown("![[a/pic.png|100x145]]\n").html).toContain('width="100" height="145"');
    // Unlabeled sizes are not aliases: the label falls back to the target.
    expect(renderMarkdown("![[pic.png|100]]\n").html).toContain('data-wikilink="pic.png"');
    // Unsized image embeds keep the legacy anchor.
    expect(renderMarkdown("![[pic.png]]\n").html).toContain('class="md-embed-link"');
    // Note embeds keep numeric aliases (no <img> upgrade).
    expect(renderMarkdown("![[Note|100]]\n").html).toContain(">100</a>");
    // PDF: #page rides in src, #height becomes the element height.
    expect(renderMarkdown("![[doc.pdf#page=2]]\n").html).toContain('<embed src="doc.pdf#page=2"');
    expect(renderMarkdown("![[doc.pdf#height=400]]\n").html).toContain('height="400"');
    expect(renderMarkdown("![[doc.pdf#page=3&height=400]]\n").html).toContain('src="doc.pdf#page=3&amp;height=400"');
    expect(renderMarkdown("![[doc.pdf#page=3&height=400]]\n").html).toContain('height="400"');
    // Garbage params degrade to the legacy tag, never a broken one.
    expect(renderMarkdown("![[doc.pdf#page=x]]\n").html).toContain('<embed src="doc.pdf#page=x"');
    expect(renderMarkdown("![[doc.pdf#page=x]]\n").html).not.toContain("height=");
  });
});
