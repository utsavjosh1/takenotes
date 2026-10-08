import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { resolveLinkTarget } from "@takenotes/core/index/edges";
import {
  formatMarkdownLink,
  formatWikilink,
  parseWikilinkContext,
  type AliasCandidate,
  type BlockCandidate,
  type HeadingCandidate,
  type LinkFormat,
  type WikilinkCandidate,
} from "@takenotes/core/links/completion";

/** `[[` autocomplete data. The editor owns the popup; the caller (pane)
 * feeds index-backed data through these callbacks so this module never
 * imports workspace state directly. */
export type LinkCompleteDeps = {
  listFiles: () => WikilinkCandidate[];
  listHeadings: (path: string) => HeadingCandidate[];
  listBlocks: (path: string) => BlockCandidate[];
  listAliases: () => AliasCandidate[];
  activePath: () => string;
  linkFormat: () => LinkFormat;
  useWikilinks: () => boolean;
};

/** Append `]]` unless the cursor already sits before one. */
function closeFor(view: { state: { doc: { length: number }; sliceDoc: (f: number, t: number) => string } }, pos: number): string {
  return view.state.sliceDoc(pos, Math.min(pos + 2, view.state.doc.length)) === "]]" ? "" : "]]";
}

/** File option: label is the basename, `detail` is the folder path so
 * duplicate names disambiguate (`Note` + `projects` vs `Note` + `archive`).
 * `ctxStart` is the absolute offset of `[[` (or `!` for embeds). */
export function fileOption(
  cand: WikilinkCandidate,
  ctx: { activePath: string; format: LinkFormat; embed: boolean; ctxStart: number; useWikilinks: boolean },
): Completion {
  return {
    label: cand.name,
    detail: cand.sub || undefined,
    apply: (view, _completion, _from, to) => {
      // Markdown mode writes `[Name](path.md)`; the `[[` trigger that
      // opened the popup is still fully replaced, so no syntax lingers.
      // (Embeds `![[…]]` always stay wikilink: `![label](url)` sizing and
      // attachment policy arrive with Step 4 attachments.)
      const insert =
        !ctx.useWikilinks && !ctx.embed
          ? formatMarkdownLink(cand.path, cand.name, ctx.activePath, ctx.format)
          : `${ctx.embed ? "!" : ""}[[${formatWikilink(cand.path, ctx.activePath, ctx.format)}${closeFor(view, to)}`;
      view.dispatch({ changes: { from: ctx.ctxStart, to, insert } });
    },
  };
}

/** Heading option replaces only the `#frag` tail, preserving `[[file#`.
 * The source range starts after `#`, so the insert carries no `#` —
 * re-adding it produced `[[file##Heading]]`. Heading/block refinements
 * stay `[[…]]` even with `useWikilinks` off (file links go Markdown) —
 * Markdown fragment generation is deferred, not guessed. */
export function headingOption(head: HeadingCandidate): Completion {
  return {
    label: head.text,
    detail: `H${head.level}`,
    apply: (view, _completion, from, to) => {
      view.dispatch({ changes: { from, to, insert: `${head.text}${closeFor(view, to)}` } });
    },
  };
}

/** Block option replaces only the `^frag` tail, preserving `[[file#`.
 * Like headings, the source range starts after `#`, so the insert keeps
 * the caret but drops the `#`. */
export function blockOption(block: BlockCandidate): Completion {
  return {
    label: `^${block.id}`,
    detail: `line ${block.line}`,
    apply: (view, _completion, from, to) => {
      view.dispatch({ changes: { from, to, insert: `^${block.id}${closeFor(view, to)}` } });
    },
  };
}

/** Alias option: typing an alias completes the note it names. Insertion
 * preserves the alias as the display label (`[[path|alias]]`) in the
 * active link format; `ctxStart` is the absolute offset of `[[`. */
export function aliasOption(
  cand: AliasCandidate,
  ctx: { activePath: string; format: LinkFormat; embed: boolean; ctxStart: number; useWikilinks: boolean },
): Completion {
  return {
    label: cand.alias,
    detail: cand.sub ? `${cand.name} · ${cand.sub}` : cand.name,
    apply: (view, _completion, _from, to) => {
      const insert =
        !ctx.useWikilinks && !ctx.embed
          ? formatMarkdownLink(cand.path, cand.alias, ctx.activePath, ctx.format)
          : `${ctx.embed ? "!" : ""}[[${formatWikilink(cand.path, ctx.activePath, ctx.format)}|${cand.alias}${closeFor(view, to)}`;
      view.dispatch({ changes: { from: ctx.ctxStart, to, insert } });
    },
  };
}

/** Completion source: open `[[frag` completes files, `[[file#frag`
 * completes that file's headings. Resolution reuses the edge-table rule;
 * insertion honors the link-generation setting. */
export function wikilinkCompletionSource(deps: LinkCompleteDeps) {
  return (context: CompletionContext): CompletionResult | null => {
    const line = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);
    const parsed = parseWikilinkContext(before);
    if (!parsed) return null;
    const activePath = deps.activePath();
    const format = deps.linkFormat();
    const useWikilinks = deps.useWikilinks();
    const ctxStart = line.from + parsed.start;
    if (parsed.kind === "file") {
      // File names and aliases share one list: typing either surfaces the
      // note (CodeMirror filters both by label). Alias hits keep the alias
      // as the display label on insert.
      return {
        from: ctxStart + (parsed.embed ? 3 : 2),
        options: [
          ...deps.listFiles().map((c) => fileOption(c, { activePath, format, embed: parsed.embed, ctxStart, useWikilinks })),
          ...deps.listAliases().map((c) => aliasOption(c, { activePath, format, embed: parsed.embed, ctxStart, useWikilinks })),
        ],
      };
    }
    // `[[#frag` / `[[#^frag` address the active note itself (the parser
    // drops empty targets, so resolution would miss them — fall back here).
    const paths = deps.listFiles().map((f) => f.path);
    const target = parsed.fileFrag === "" ? activePath : resolveLinkTarget(parsed.fileFrag, paths);
    if (!target) return null;
    const hashAt = before.lastIndexOf("#");
    if (parsed.kind === "block") {
      return {
        from: line.from + hashAt + 1,
        options: deps.listBlocks(target).map(blockOption),
      };
    }
    return {
      from: line.from + hashAt + 1,
      options: deps.listHeadings(target).map(headingOption),
    };
  };
}
