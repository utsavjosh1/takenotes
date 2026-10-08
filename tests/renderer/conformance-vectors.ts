/**
 * Shared conformance vectors (Stage 6): the contract locking `wysiwyg.ts`
 * (the single desktop editing surface) and `render.ts` (`renderMarkdown`,
 * hover preview and export) together on what is hidden vs visible.
 *
 * `render.ts` semantics are frozen — vectors only. Where the two renderers
 * intentionally differ (fenced fences stay editable source per ADR-0015),
 * the difference is an explicit `editorOnly` expectation, never silence.
 *
 * Known gap (not vectored yet): `[[wikilink]]` outer brackets and `|` aliases
 * stay raw in the editor while `renderMarkdown` resolves them to anchors.
 * Vector them once the alias chip lands; see the note in conformance.test.ts.
 */

export type ConformanceVector = {
  name: string;
  markdown: string;
  /** Visible as text in BOTH the editor surface and the rendered HTML. */
  visible: string[];
  /** Markdown syntax hidden in BOTH (absent from visible text). */
  hidden: string[];
  /** Visible in the editor only — a documented, locked-in divergence. */
  editorOnly?: string[];
};

export const CONFORMANCE_VECTORS: ConformanceVector[] = [
  {
    name: "headings",
    markdown: "# Hello\n\n### Deep below\n",
    visible: ["Hello", "Deep below"],
    hidden: ["# Hello", "###"],
  },
  {
    name: "bold",
    markdown: "a **bold** c\n",
    visible: ["a", "bold", "c"],
    hidden: ["**"],
  },
  {
    name: "italic",
    markdown: "a *italic* c\n",
    visible: ["a", "italic", "c"],
    hidden: ["*italic*"],
  },
  {
    name: "strike",
    markdown: "a ~~gone~~ c\n",
    visible: ["a", "gone", "c"],
    hidden: ["~~"],
  },
  {
    name: "inline code",
    markdown: "a `code` c\n",
    visible: ["a", "code", "c"],
    hidden: ["`code`"],
  },
  {
    name: "link",
    markdown: "[label](https://example.com/x)\n",
    visible: ["label"],
    hidden: ["[label]", "](https://example.com/x)"],
  },
  {
    name: "autolink stays visible",
    markdown: "see https://example.com/x here\n",
    visible: ["see", "https://example.com/x", "here"],
    hidden: [],
  },
  {
    name: "bullet list",
    markdown: "- alpha\n  - nested\n",
    visible: ["alpha", "nested"],
    hidden: ["- alpha"],
  },
  {
    name: "ordered list",
    markdown: "1. one\n1. two\n",
    visible: ["one", "two"],
    hidden: ["1. one"],
  },
  {
    name: "task",
    markdown: "- [ ] Buy milk\n",
    visible: ["Buy milk"],
    hidden: ["[ ]"],
  },
  {
    name: "table",
    markdown: "| a | b |\n|---|---|\n| 1 | 2 |\n",
    visible: ["a", "b", "1", "2"],
    hidden: ["|", "---"],
  },
  {
    name: "callout",
    markdown: "> [!note] Title\n> body\n",
    visible: ["Title", "body"],
    hidden: ["[!note]", "> [!note]"],
  },
  {
    name: "blockquote",
    markdown: "> quoted\n",
    visible: ["quoted"],
    hidden: ["> quoted"],
  },
  {
    name: "rule",
    markdown: "above\n\n---\n\nbelow\n",
    visible: ["above", "below"],
    hidden: ["---"],
  },
  {
    name: "footnote",
    markdown: "text [^id]\n\n[^id]: the note\n",
    visible: ["text", "the note"],
    hidden: ["[^id]:"],
  },
  {
    name: "comment",
    markdown: "a %%secret%% b\n",
    visible: ["a", "b"],
    hidden: ["%%", "secret"],
  },
  {
    name: "image",
    markdown: "![alt](img.png)\n",
    visible: ["alt"],
    hidden: ["![", "](img.png)"],
  },
  {
    name: "note embed",
    markdown: "see ![[My Note]] here\n",
    visible: ["see", "My Note", "here"],
    hidden: ["![[", "]]"],
  },
  {
    name: "fenced code",
    markdown: "```js\ncode here\n```\n",
    visible: ["code here"],
    hidden: [],
    // ADR-0015: fences stay editable source in the editor; renderMarkdown
    // folds them into <pre>. Locked here so neither side drifts silently.
    editorOnly: ["```"],
  },
];
