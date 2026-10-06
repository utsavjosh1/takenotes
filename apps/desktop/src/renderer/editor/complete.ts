import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { resolveLinkTarget } from "@takenotes/core/index/edges";
import {
  formatWikilink,
  parseWikilinkContext,
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
  activePath: () => string;
  linkFormat: () => LinkFormat;
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
  ctx: { activePath: string; format: LinkFormat; embed: boolean; ctxStart: number },
): Completion {
  return {
    label: cand.name,
    detail: cand.sub || undefined,
    apply: (view, _completion, _from, to) => {
      const insert = `${ctx.embed ? "!" : ""}[[${formatWikilink(cand.path, ctx.activePath, ctx.format)}${closeFor(view, to)}`;
      view.dispatch({ changes: { from: ctx.ctxStart, to, insert } });
    },
  };
}

/** Heading option replaces only the `#frag` tail, preserving `[[file`. */
export function headingOption(head: HeadingCandidate): Completion {
  return {
    label: head.text,
    detail: `H${head.level}`,
    apply: (view, _completion, from, to) => {
      view.dispatch({ changes: { from, to, insert: `#${head.text}${closeFor(view, to)}` } });
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
    const ctxStart = line.from + parsed.start;
    if (parsed.kind === "file") {
      return {
        from: ctxStart + (parsed.embed ? 3 : 2),
        options: deps
          .listFiles()
          .map((c) => fileOption(c, { activePath, format, embed: parsed.embed, ctxStart })),
      };
    }
    const paths = deps.listFiles().map((f) => f.path);
    const target = resolveLinkTarget(parsed.fileFrag, paths);
    if (!target) return null;
    const hashAt = before.lastIndexOf("#");
    return {
      from: line.from + hashAt + 1,
      options: deps.listHeadings(target).map(headingOption),
    };
  };
}
