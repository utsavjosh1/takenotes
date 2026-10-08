/** Step 8 HTML import (Phase 5f): hand-rolled HTML → Markdown, pure + total.
 *
 * V1 covers single-file imports only (no network fetch — remote images
 * stay remote with a warning; no CSS/layout fidelity). Subset:
 * headings, paragraphs, line breaks, bold/italic/code, links, images,
 * nested lists, blockquotes (`>` prefixes, nesting supported), fenced
 * code blocks, horizontal rules, and simple tables (→ GFM pipes,
 * bounded). Script/style/head content, comments, and unknown tags drop
 * (inner text kept). Entities decoded (`&amp; &lt; &gt; &quot;`,
 * `&#39;`, `&nbsp;`, decimal/hex numeric).
 *
 * No dependencies (supply-chain + helper-bundle friendly) and no DOM:
 * a small tokenizer over tags. Malformed markup degrades to text —
 * never throws, never hangs (bounded output).
 */

type ListState = { ordered: boolean; counter: number };

export function htmlToMarkdown(input: string): string {
  if (typeof input !== "string") return "";
  let html = input;
  // Drop comments, doctype, and non-content blocks.
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  html = html.replace(/<!doctype[^>]*>/gi, "");
  html = html.replace(/<(script|style|head|noscript)[\s\S]*?<\/\1\s*>/gi, "");
  // Prefer <body> when present (drops nav/header chrome).
  const body = /<body[^>]*>([\s\S]*)<\/body\s*>/i.exec(html);
  if (body) html = body[1]!;

  let out = "";
  const lists: ListState[] = [];
  const hrefStack: string[] = [];
  let quoteDepth = 0;
  let inPre = false;
  let table: string[][] | null = null;
  let tableCell: string | null = null;

  const push = (text: string): void => {
    if (tableCell !== null) tableCell += text;
    else out += text;
  };
  const newline = (): void => {
    if (tableCell !== null) {
      tableCell += " ";
      return;
    }
    if (!out.endsWith("\n")) out += "\n";
  };

  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+)/g;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(html)) !== null) {
    const [, tagName, attrs, text] = match;
    if (text !== undefined) {
      let decoded = decodeEntities(text);
      if (!inPre) decoded = decoded.replace(/[ \t\f\v\r]+/g, " ");
      push(decoded);
      continue;
    }
    const tag = tagName!.toLowerCase();
    const closing = match[0][1] === "/";
    const attr = attrs ?? "";

    if (tag === "pre") {
      if (!closing) {
        newline();
        push("```\n");
        inPre = true;
      } else {
        inPre = false;
        if (!out.endsWith("\n")) out += "\n";
        push("```\n\n");
      }
      continue;
    }
    if (inPre) continue;

    switch (tag) {
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        if (!closing) {
          newline();
          push(`${"#".repeat(Number(tag[1]))} `);
        } else {
          push("\n\n");
        }
        break;
      }
      case "p":
      case "div":
      case "section":
      case "article":
      case "header":
      case "footer":
      case "main":
      case "figure":
      case "figcaption":
        if (closing) push("\n\n");
        else newline();
        break;
      case "br":
        push("  \n");
        break;
      case "hr":
        newline();
        push("---\n\n");
        break;
      case "strong":
      case "b":
        push("**");
        break;
      case "em":
      case "i":
        push("*");
        break;
      case "code":
        push("`");
        break;
      case "a": {
        if (closing) {
          const href = hrefStack.pop() ?? "";
          push(href ? `](${href})` : "]");
        } else {
          push("[");
          hrefStack.push(attrValue(attr, "href") ?? "");
        }
        break;
      }
      case "img": {
        const src = attrValue(attr, "src") ?? "";
        const alt = attrValue(attr, "alt") ?? "";
        push(`![${alt}](${src})`);
        break;
      }
      case "ul":
        if (!closing) lists.push({ ordered: false, counter: 0 });
        else {
          lists.pop();
          if (lists.length === 0) push("\n");
        }
        break;
      case "ol": {
        if (!closing) {
          const start = Number(attrValue(attr, "start") ?? "1");
          lists.push({ ordered: true, counter: Number.isFinite(start) ? start - 1 : 0 });
        } else {
          lists.pop();
          if (lists.length === 0) push("\n");
        }
        break;
      }
      case "li": {
        if (!closing) {
          newline();
          const depth = lists.length;
          const indent = "  ".repeat(Math.max(0, depth - 1));
          const top = lists[depth - 1];
          if (top?.ordered) {
            top.counter += 1;
            push(`${indent}${top.counter}. `);
          } else {
            push(`${indent}- `);
          }
        }
        break;
      }
      case "blockquote":
        if (!closing) {
          newline();
          quoteDepth += 1;
          push("\uE000");
        } else {
          quoteDepth = Math.max(0, quoteDepth - 1);
          push("\uE001\n\n");
        }
        break;
      case "table":
        if (!closing) table = [];
        else {
          if (table) push(tableToMarkdown(table));
          table = null;
          tableCell = null;
        }
        break;
      case "tr":
        if (!closing && table) table.push([]);
        break;
      case "td":
      case "th":
        if (!closing && table) {
          if (tableCell !== null) {
            const row = table[table.length - 1]!;
            row.push(tableCell);
          }
          tableCell = "";
        } else if (closing && table && tableCell !== null) {
          const row = table[table.length - 1]!;
          row.push(tableCell);
          tableCell = null;
        }
        break;
      default:
        break;
    }
  }

  return applyQuotes(collapseBlankLines(out.replace(/[ \t]+\n/g, "\n").trim()));
}

/** Lines between \uE000…\uE001 markers gain `>` prefixes (one per open
 * depth at line start). Markers nest; unbalanced closers are ignored. */
function applyQuotes(text: string): string {
  const lines = text.split("\n");
  let depth = 0;
  return lines
    .map((line) => {
      const opens = line.split("").filter((c) => c === "\uE000").length;
      const closes = line.split("").filter((c) => c === "\uE001").length;
      const stripped = line.replace(/[\uE000\uE001]/g, "");
      depth += opens;
      const prefix = "> ".repeat(Math.min(depth, 5));
      depth = Math.max(0, depth - closes);
      if (!stripped.trim()) return "";
      return prefix ? `${prefix}${stripped}` : stripped;
    })
    .join("\n");
}

function attrValue(attrs: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = re.exec(attrs);
  if (!m) return null;
  return m[2] ?? m[3] ?? m[4] ?? null;
}

function tableToMarkdown(rows: string[][]): string {
  const clean = rows
    .map((row) => row.map((cell) => cell.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim()))
    .filter((row) => row.some((cell) => cell !== ""));
  if (clean.length === 0) return "";
  const width = Math.max(...clean.map((row) => row.length));
  const norm = clean.map((row) => {
    const padded = [...row];
    while (padded.length < width) padded.push("");
    return padded;
  });
  const lines = [`| ${norm[0]!.join(" | ")} |`, `| ${norm[0]!.map(() => "---").join(" | ")} |`];
  for (const row of norm.slice(1)) lines.push(`| ${row.join(" | ")} |`);
  return `\n${lines.join("\n")}\n\n`;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, digits: string) => {
      const code = Number(digits);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : _m;
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : _m;
    });
}

function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n");
}
