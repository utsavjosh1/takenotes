import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** CLAUDE.md bans these words in the interface. Code identifiers may keep them,
 * so only text a person can read is checked: strings with a space or one
 * capitalised word, and JSX text. */
const BANNED = /\b(backlinks?|outline|properties|property|frontmatter|front matter|markdown|vault|wikilinks?|regex)\b/i;
const SINGLE_WORD = /^(Backlinks?|Outline|Properties|Property|Frontmatter|Markdown|Vault|Wikilinks?|Regex)$/;
const ROOT = join(__dirname, "..", "..");
/** Strings that are code, not prose: comparisons, selectors, utility classes. */
const CODE_LIKE = /===|=>|\[data-|\b[a-z-]+:[a-z-]+-\d|\) \? \(|"\s*\?/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === "node_modules" || n === "dist") return [];
    // icon-data is SVG markup, effects.tsx is Tailwind class strings: neither is prose.
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) && !/(\.d\.ts|\.stories\.tsx|icon-data\.ts|generated\.ts|effects\.tsx)$/.test(n) ? [p] : [];
  });
}

function stripCode(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/^\s*import[^;]*;/gm, "").replace(/^\s*export [^;]*from [^;]*;/gm, "");
}

function visibleText(src: string): string[] {
  const out: string[] = [];
  for (const m of stripCode(src).matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
    const s = (m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{[^}]*\}/g, " ");
    if (/\s/.test(s.trim()) && /[A-Za-z]{3}/.test(s) || SINGLE_WORD.test(s)) out.push(s);
  }
  for (const m of stripCode(src).matchAll(/>([^<>{}]*[A-Za-z]{3}[^<>{}]*)</g)) out.push(m[1]!);
  return out;
}

const SURFACES: Array<[string, string]> = [
  ["desktop components", join(ROOT, "apps/desktop/src/renderer/components")],
  ["desktop hooks", join(ROOT, "apps/desktop/src/renderer/hooks")],
  ["desktop shell", join(ROOT, "apps/desktop/src/renderer/App.tsx")],
  ["mobile screens", join(ROOT, "apps/mobile/app")],
  ["mobile components", join(ROOT, "apps/mobile/components")],
  ["ui package", join(ROOT, "packages/ui/src/dom")],
];

describe("interface text uses plain words", () => {
  for (const [name, path] of SURFACES) {
    it(name, () => {
      const files = statSync(path).isDirectory() ? walk(path) : [path];
      const hits: string[] = [];
      for (const f of files) for (const t of visibleText(readFileSync(f, "utf8"))) {
        // File extensions and format names inside paths are not prose.
        if (!CODE_LIKE.test(t) && BANNED.test(t.replace(/\.(md|markdown)\b/gi, ""))) hits.push(`${f.slice(ROOT.length + 1)}: ${t.trim().slice(0, 80)}`);
      }
      expect(hits).toEqual([]);
    });
  }

  it("command titles are plain words", () => {
    const src = readFileSync(join(ROOT, "packages/core/src/commands/registry.ts"), "utf8");
    const titles = [...src.matchAll(/title: "([^"]+)"/g)].map((m) => m[1]!);
    expect(titles.length).toBeGreaterThan(20);
    expect(titles.filter((t) => BANNED.test(t))).toEqual([]);
  });
});
