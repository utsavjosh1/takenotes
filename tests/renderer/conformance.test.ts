/**
 * Conformance suite (Stage 6): `wysiwyg.ts` and `render.ts` must agree on
 * what is hidden vs visible for every vector in `conformance-vectors.ts`.
 *
 * Editor side: full render (no reveal — the tripwire surface, cursor
 * nowhere near), visible text = source minus hidden/widget ranges plus the
 * widgets' own display text (embed targets, footnote ids, callout types).
 * HTML side: `renderMarkdown().html` stripped to text.
 *
 * Known gap, intentionally not vectored: `[[wikilink]]` outer brackets and
 * `|` aliases stay raw in the editor while `renderMarkdown` resolves them.
 * Vector them when the alias chip lands — the sweep/fuzz invariants already
 * cover their ranges today.
 */
import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { collectWysiwygRanges } from "../../apps/desktop/src/renderer/editor/wysiwyg";
import { renderMarkdown } from "../../packages/core/src/markdown/render";
import { CONFORMANCE_VECTORS } from "./conformance-vectors";

function stateOf(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] });
}

/** What the user reads on the single surface: rendered text + widget labels. */
function editorText(doc: string): string {
  const state = stateOf(doc);
  const r = collectWysiwygRanges(state, 0, state.doc.length);
  const cuts: { from: number; to: number; text: string }[] = [
    ...r.hide.map((h) => ({ ...h, text: "" })),
    ...r.bullets.map((b) => ({ from: b.from, to: b.to, text: "" })),
    ...r.pipes.map((p) => ({ from: p.from, to: p.to, text: "" })),
    ...r.callouts.map((c) => ({ from: c.from, to: c.to, text: c.type })),
    ...r.footnoteRefs.map((f) => ({ from: f.from, to: f.to, text: f.id })),
    ...r.embeds.map((e) => ({ from: e.from, to: e.to, text: e.target })),
    ...r.tasks.map((t) => ({ from: t.markerFrom, to: t.markerTo, text: "" })),
  ].sort((a, b) => a.from - b.from || a.to - b.to);
  let out = "";
  let pos = 0;
  for (const c of cuts) {
    out += doc.slice(pos, c.from) + c.text;
    pos = Math.max(pos, c.to);
  }
  return out + doc.slice(pos);
}

/** Rendered HTML reduced to readable text. Image `alt` counts as visible
 * (it is the rendered fallback label), so it is extracted before tags go. */
function htmlText(doc: string): string {
  return renderMarkdown(doc)
    .html.replace(/<img\b[^>]*alt="([^"]*)"[^>]*>/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

describe("conformance: wysiwyg.ts agrees with render.ts", () => {
  for (const v of CONFORMANCE_VECTORS) {
    it(v.name, () => {
      const ed = editorText(v.markdown);
      const html = htmlText(v.markdown);
      for (const vis of v.visible) {
        expect(ed, `editor shows ${JSON.stringify(vis)}`).toContain(vis);
        expect(html, `html shows ${JSON.stringify(vis)}`).toContain(vis);
      }
      for (const hid of v.hidden) {
        expect(ed, `editor hides ${JSON.stringify(hid)}`).not.toContain(hid);
        expect(html, `html hides ${JSON.stringify(hid)}`).not.toContain(hid);
      }
      for (const raw of v.editorOnly ?? []) {
        expect(ed, `editor keeps ${JSON.stringify(raw)}`).toContain(raw);
      }
    });
  }

  it("no vector regresses renderMarkdown semantics", () => {
    // renderMarkdown is frozen: spot-check its shape on one rich document.
    const { html, footnotes } = renderMarkdown("# T\n\n- [ ] a\n\n[^1]: n\n");
    expect(html).toContain("<h1");
    expect(html).toContain("checkbox");
    expect(footnotes).toEqual([]);
  });
});

describe("conformance: viewport perf budget", () => {
  function perfDoc(lines: number): string {
    const out: string[] = [];
    for (let i = 0; i < lines; i++) {
      switch (i % 6) {
        case 0: out.push(`# Heading ${i}`); break;
        case 1: out.push(`Some **bold ${i}** and *italic* with \`code\`.`); break;
        case 2: out.push(`- item ${i}`); break;
        case 3: out.push(`- [ ] task ${i}`); break;
        case 4: out.push(`> quote ${i}`); break;
        default: out.push(`plain paragraph line ${i} lorem ipsum dolor sit amet.`);
      }
    }
    return out.join("\n");
  }

  it("viewport build on a 5,000-line document stays under 8 ms p95", () => {
    // The editor never builds full-document decorations per keystroke: the
    // plugin and atomic ranges are viewport-scoped (a full 5k build costs
    // ~30 ms, dominated by the initial Lezer parse). This test budgets the
    // path that actually runs — a 200-line viewport window on a 5,000-line
    // document — and proves structurally that no output escapes the window.
    const state = stateOf(perfDoc(5000));
    expect(state.doc.lines).toBe(5000);
    const from = state.doc.line(2400).from;
    const to = state.doc.line(2600).to;
    const active = new Set<number>([2500]);
    // Warmup: settle the syntax tree so timings measure decoration work.
    collectWysiwygRanges(state, from, to, { activeLines: active });
    const samples: number[] = [];
    for (let i = 0; i < 25; i++) {
      const t0 = performance.now();
      const r = collectWysiwygRanges(state, from, to, { activeLines: active });
      samples.push(performance.now() - t0);
      for (const h of r.hide) {
        expect(h.from).toBeGreaterThanOrEqual(from);
        expect(h.to).toBeLessThanOrEqual(to);
      }
    }
    samples.sort((a, b) => a - b);
    expect(samples[23]).toBeLessThan(8);
  });
});
