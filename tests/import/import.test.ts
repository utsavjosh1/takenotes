import { describe, expect, it } from "vitest";
import { htmlToMarkdown } from "@takenotes/core/import/html";
import { planImport } from "@takenotes/core/import/plan";

describe("html to markdown", () => {
  it("converts headings, emphasis, links, and lists", () => {
    const md = htmlToMarkdown(
      "<html><head><title>drop</title></head><body><h1>Title</h1><p>Hello <strong>bold</strong> and <em>it</em> with <a href=\"https://x.y/z\">a link</a>.</p><ul><li>one</li><li>two<ul><li>nested</li></ul></li></ul></body></html>",
    );
    expect(md).toContain("# Title");
    expect(md).toContain("Hello **bold** and *it* with [a link](https://x.y/z).");
    expect(md).toContain("- one");
    expect(md).toContain("  - nested");
    expect(md).not.toContain("drop");
  });

  it("converts images, code, quotes, tables, and entities", () => {
    const md = htmlToMarkdown(
      "<p><img src=\"pic.png\" alt=\"a pic\"></p><pre>const x = 1;</pre><blockquote><p>quoted &amp; <code>coded</code></p></blockquote><table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table><p>fish &lt; chips &#8212; done</p>",
    );
    expect(md).toContain("![a pic](pic.png)");
    expect(md).toContain("```\nconst x = 1;\n```");
    expect(md).toContain("> quoted & `coded`");
    expect(md).toContain("| a | b |");
    expect(md).toContain("| --- | --- |");
    expect(md).toContain("fish < chips — done");
  });

  it("degrades malformed markup to text without throwing", () => {
    expect(htmlToMarkdown("<p>unclosed <b>bold <div>div")).toContain("bold");
    expect(htmlToMarkdown("")).toBe("");
    expect(htmlToMarkdown("<script>alert(1)</script><p>kept</p>")).toBe("kept");
  });
});

const OPTS = {
  attachmentLocation: "subfolder" as const,
  attachmentFolder: "attachments",
  existingLower: new Set<string>(),
};

describe("import planner", () => {
  it("imports markdown with collision-proof names and note-link rewrites", () => {
    const plan = planImport(
      [
        { rel: "a.md", kind: "markdown", text: "# A\nsee [b](sub/b.md) and ![i](img/pic.png)" },
        { rel: "sub/b.md", kind: "markdown", text: "# B" },
        { rel: "img/pic.png", kind: "asset" },
      ],
      { ...OPTS, existingLower: new Set(["a.md"]) },
    );
    expect(plan.notes.map((n) => n.targetPath).sort()).toEqual(["a 1.md", "b.md"]);
    const a = plan.notes.find((n) => n.sourceRel === "a.md")!;
    expect(a.content).toContain("[b](b.md)");
    expect(a.content).toContain("![i](attachments/pic.png)");
    expect(plan.attachments).toEqual([{ sourceRel: "img/pic.png", targetPath: "attachments/pic.png" }]);
    expect(plan.unmapped).toEqual([]);
  });

  it("converts html, keeps remote refs, and reports missing assets", () => {
    const plan = planImport(
      [{ rel: "page.html", kind: "html", text: "<h1>T</h1><p><img src=\"https://cdn/x.png\"><a href=\"gone.md\">g</a></p>" }],
      OPTS,
    );
    expect(plan.notes).toHaveLength(1);
    expect(plan.notes[0]!.targetPath).toBe("page.md");
    expect(plan.notes[0]!.content).toContain("# T");
    expect(plan.notes[0]!.content).toContain("![](https://cdn/x.png)");
    expect(plan.unmapped).toEqual([
      { note: "page.md", ref: "https://cdn/x.png" },
      { note: "page.md", ref: "gone.md" },
    ]);
  });

  it("names textbundle notes after the bundle and skips over-cap extras", () => {
    const sources = [
      { rel: "Trip.textbundle/text.md", kind: "markdown" as const, text: "hi ![v](assets/v.jpg)" },
      { rel: "Trip.textbundle/assets/v.jpg", kind: "asset" as const },
      ...Array.from({ length: 600 }, (_, i) => ({ rel: `n${i}.md`, kind: "markdown" as const, text: "x" })),
    ];
    const plan = planImport(sources, OPTS);
    expect(plan.notes[0]).toMatchObject({ sourceRel: "Trip.textbundle/text.md", targetPath: "Trip.md" });
    expect(plan.attachments).toEqual([{ sourceRel: "Trip.textbundle/assets/v.jpg", targetPath: "attachments/v.jpg" }]);
    expect(plan.skipped.length).toBeGreaterThan(0);
    expect(plan.warnings.join()).toMatch(/500/);
  });

  it("leaves wikilinks and anchors untouched", () => {
    const plan = planImport(
      [{ rel: "a.md", kind: "markdown", text: "[[Other]] and [s](#sec) and <b>x</b>" }],
      OPTS,
    );
    expect(plan.notes[0]!.content).toContain("[[Other]]");
    expect(plan.unmapped).toEqual([{ note: "a.md", ref: "#sec" }]);
  });
});
