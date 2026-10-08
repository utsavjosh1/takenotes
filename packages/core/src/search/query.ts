import type { AppError } from "@takenotes/contracts/errors";

/** Search V2 query language (Step 5, `docs/specs/search-grammar.md`).
 * Deterministic, pure, total — filesystem- and renderer-independent.
 *
 * Grammar (precedence `OR` < `AND`/implicit < unary `-`):
 *
 *   query    ::= or_expr
 *   or_expr  ::= and_expr ("OR" and_expr)*          (* "OR" uppercase only *)
 *   and_expr ::= unary (("AND")? unary)*            (* whitespace = AND *)
 *   unary    ::= "-"* primary
 *   primary  ::= "(" or_expr ")" | operand
 *   operand  ::= phrase | regex | prop | filter | text
 *
 * Operands: `word`, `"phrase"`, `/re/` (case-insensitive), `file:`,
 * `path:`, `tag:`, `type:`, `is:task`, `content:`, `section:`,
 * `task-todo:`, `task-done:`, `task:`, `block:`, `line:n`,
 * `match-case:`, `ignore-case:`, `[p:v]` / `[p:]` / `[p:null]` /
 * `[p:<op>v]` comparators. Unknown `name:value` shapes are
 * INVALID_REQUEST naming the operator and its 0-based position — never
 * silently reinterpreted. URLs, times, dotted names, lone `-`, and
 * lowercase and/or/not stay plain text. A paren mid-token stays literal
 * (`@due(2026-09-25)` is one text term); edge-adjacent parens group.
 *
 * Value casing: case-insensitive fields are lowercased at parse
 * (`text`, `phrase`, `file:`, `path:`, `tag:`, `type:`, `content:`,
 * `section:`, `task:`, `task-todo:`, `task-done:`, `block:`,
 * `ignore-case:`). Case-sensitive fields keep raw text (`/re/`,
 * `match-case:`, prop names/values — prop *matching* itself stays
 * case-insensitive at eval; only the stored form is raw).
 */

export type PropCompareOp = "<" | "<=" | ">" | ">=" | "=" | "!=";

export type SearchNode =
  | { kind: "and"; children: SearchNode[] }
  | { kind: "or"; children: SearchNode[] }
  | { kind: "not"; child: SearchNode }
  | { kind: "true" }
  | { kind: "text"; value: string }
  | { kind: "phrase"; value: string }
  | { kind: "regex"; pattern: string; regex: RegExp }
  | { kind: "file"; value: string }
  | { kind: "path"; value: string }
  | { kind: "tag"; value: string }
  | { kind: "type"; value: string }
  | { kind: "isTask" }
  | { kind: "content"; value: string }
  | { kind: "section"; value: string }
  | { kind: "task"; value: string }
  | { kind: "taskTodo"; value?: string }
  | { kind: "taskDone"; value?: string }
  | { kind: "line"; n: number }
  | { kind: "block"; value: string }
  | { kind: "matchCase"; value: string }
  | { kind: "ignoreCase"; value: string }
  | { kind: "propExists"; name: string }
  | { kind: "prop"; name: string; value: string }
  | { kind: "propMissing"; name: string }
  | { kind: "propCompare"; name: string; op: PropCompareOp; value: string };

/** Root of a parsed query (almost always an `and` node). */
export type SearchQuery = SearchNode;

export type SearchParseError = AppError & { operator: string; position: number };

export type SearchParseResult = { ok: true; query: SearchQuery } | { ok: false; error: SearchParseError };

export const MAX_REGEX_PATTERN_LEN = 200;

function normalizeTagValue(raw: string): string {
  return raw.replace(/^#+/, "").trim().toLowerCase();
}

/** Strip one layer of surrounding quotes (tolerates the unterminated side). */
function unquote(value: string): string {
  let v = value;
  if (v.startsWith('"')) v = v.slice(1);
  if (v.endsWith('"') && v.length > 0) v = v.slice(0, -1);
  return v.trim();
}

function invalid(operator: string, position: number, detail: string): SearchParseResult {
  return {
    ok: false,
    error: {
      code: "INVALID_REQUEST",
      message: `Invalid search query at ${position}: ${detail} (in "${operator}").`,
      operator,
      position,
    },
  };
}

const KNOWN_FILTERS = new Set([
  "file",
  "path",
  "tag",
  "type",
  "is",
  "content",
  "section",
  "task-todo",
  "task-done",
  "task",
  "block",
  "line",
  "match-case",
  "ignore-case",
]);

function isOpChar(ch: string): boolean {
  return ch !== "" && /[A-Za-z]/.test(ch);
}

/** Operator-shape test for a `name:value` candidate: `^[A-Za-z][A-Za-z0-9-]*$`
 * with no `://` (URLs) and no dots (dotted names stay text). Numeric heads
 * (`12:30`) fail the first class and stay text. */
function isOperatorShape(name: string, token: string): boolean {
  if (token.includes("://")) return false;
  return /^[A-Za-z][A-Za-z0-9-]*$/.test(name);
}

/** Reject nested-quantifier regexes (`(a+)+`, `(a*)*`, `(x+x+)+y`) with a
 * sub-millisecond string scan at parse time. */
function hasNestedQuantifier(pattern: string): boolean {
  return /\([^()]*[+*{][^()]*\)[+*{?]/.test(pattern);
}

function compileRegex(pattern: string, operator: string, position: number): SearchParseResult | { regex: RegExp } {
  if (pattern.length === 0) return invalid(operator, position, "empty regex");
  if (pattern.length > MAX_REGEX_PATTERN_LEN) {
    return invalid(operator, position, `regex over ${MAX_REGEX_PATTERN_LEN} chars`);
  }
  if (hasNestedQuantifier(pattern)) return invalid(operator, position, "unsafe nested quantifier in regex");
  try {
    return { regex: new RegExp(pattern, "im") };
  } catch {
    return invalid(operator, position, "uncompilable regex");
  }
}

type OkNode = { node: SearchNode };
type OkNullable = { node: SearchNode | null };
type Step = SearchParseResult | OkNode;
type StepNullable = SearchParseResult | OkNullable;

function isOk(u: Step | StepNullable): u is OkNode | OkNullable {
  return "node" in u;
}

class Parser {
  private i = 0;
  constructor(private readonly s: string) {}

  parse(): SearchParseResult {
    const root: Step = this.parseOr();
    if (!isOk(root)) {
      return root;
    }
    const node = root.node;
    this.skipWs();
    if (this.i < this.s.length) {
      const ch = this.s[this.i]!;
      if (ch === ")") return invalid(")", this.i, 'unmatched ")"');
      return invalid(this.s.slice(this.i), this.i, "unexpected input");
    }
    return { ok: true, query: node };
  }

  private skipWs(): void {
    while (this.i < this.s.length && /[ \t\n]/.test(this.s[this.i]!)) this.i++;
  }

  private boundaryAfter(j: number): boolean {
    if (j >= this.s.length) return true;
    const ch = this.s[j]!;
    return /[ \t\n()"[\]-]/.test(ch) || ch === "/";
  }

  private parseOr(): Step {
    const left: Step = this.parseAnd();
    if (!isOk(left)) return left;
    let node = left.node;
    for (;;) {
      const save = this.i;
      this.skipWs();
      if (this.s.startsWith("OR", this.i) && this.boundaryAfter(this.i + 2)) {
        this.i += 2;
        const right: Step = this.parseAnd();
        if (!isOk(right)) return right;
        const r = right.node;
        node = node.kind === "or" ? { kind: "or", children: [...node.children, r] } : { kind: "or", children: [node, r] };
        continue;
      }
      this.i = save;
      break;
    }
    return { node };
  }

  private parseAnd(): Step {
    const children: SearchNode[] = [];
    for (;;) {
      const save = this.i;
      this.skipWs();
      if (this.i >= this.s.length) {
        this.i = save;
        break;
      }
      const ch = this.s[this.i]!;
      if (ch === ")" || (this.s.startsWith("OR", this.i) && this.boundaryAfter(this.i + 2))) {
        this.i = save;
        break;
      }
      // Explicit uppercase AND: same as whitespace, skipped when it joins
      // two operands. A leading AND (no left operand yet) falls through to
      // primary and stays plain text.
      if (children.length > 0 && this.s.startsWith("AND", this.i) && this.boundaryAfter(this.i + 3)) {
        this.i += 3;
        continue;
      }
      const save2 = this.i;
      const u: StepNullable = this.parseUnary();
      if (!isOk(u)) return u as SearchParseResult;
      if (u.node === null) {
        this.i = save2;
        // Swallow the whitespace we skipped so trailing spaces don't loop.
        this.skipWs();
        if (this.i === save2) break;
        continue;
      }
      children.push(u.node);
      void save;
    }
    if (children.length === 1) return { node: children[0]! };
    return { node: { kind: "and", children } };
  }

  private parseUnary(): StepNullable {
    this.skipWs();
    if (this.i >= this.s.length) return { node: null };
    const ch = this.s[this.i]!;
    if (ch === ")" || (this.s.startsWith("OR", this.i) && this.boundaryAfter(this.i + 2))) {
      return { node: null };
    }
    // Dash run: each `-` immediately followed by more operand text negates.
    // A `-` followed by whitespace/end is a lone dash (plain text).
    let dashes = 0;
    while (this.s[this.i] === "-" && this.i + 1 < this.s.length && !/[ \t\n]/.test(this.s[this.i + 1]!)) {
      dashes++;
      this.i++;
    }
    if (dashes === 0 && ch === "-" && (this.i + 1 >= this.s.length || /[ \t\n]/.test(this.s[this.i + 1]!))) {
      // Lone `-` stays plain text.
      this.i++;
      return { node: { kind: "text", value: "-" } };
    }
    const p: StepNullable = this.parsePrimary();
    if (!isOk(p)) return p;
    if (p.node === null) {
      if (dashes > 0) return { node: { kind: "text", value: "-".repeat(dashes) } };
      return { node: null };
    }
    let node = p.node;
    for (let d = 0; d < dashes; d++) node = { kind: "not", child: node };
    return { node };
  }

  private parsePrimary(): StepNullable {
    this.skipWs();
    if (this.i >= this.s.length) return { node: null };
    const start = this.i;
    const ch = this.s[this.i]!;
    if (ch === ")") return { node: null };
    if (ch === "(") {
      this.i++;
      const inner: Step = this.parseOr();
      if (!isOk(inner)) return inner;
      this.skipWs();
      if (this.s[this.i] !== ")") return invalid("(", start, 'unclosed "("');
      this.i++;
      return inner;
    }
    if (ch === '"') {
      this.i++;
      const close = this.s.indexOf('"', this.i);
      const value = (close < 0 ? this.s.slice(this.i) : this.s.slice(this.i, close)).toLowerCase();
      this.i = close < 0 ? this.s.length : close + 1;
      if (!value.trim()) return { node: { kind: "true" } };
      return { node: { kind: "phrase", value: value.trim() } };
    }
    if (ch === "/") {
      const close = this.s.indexOf("/", this.i + 1);
      if (close < 0) return invalid(this.s.slice(start), start, 'unclosed "/" (regex needs a closing "/")');
      const pattern = this.s.slice(this.i + 1, close);
      const operator = this.s.slice(start, close + 1);
      const compiled = compileRegex(pattern, operator, start);
      if ("regex" in (compiled as object)) {
        this.i = close + 1;
        return { node: { kind: "regex", pattern, regex: (compiled as { regex: RegExp }).regex } };
      }
      return compiled as SearchParseResult;
    }
    if (ch === "[") {
      return this.parseProp(start);
    }
    return this.parseFilterOrText(start);
  }

  /** `[...]` prop operand. Respects quoted spans when finding `]`. */
  private parseProp(start: number): StepNullable {
    let j = start + 1;
    let inQuotes = false;
    while (j < this.s.length) {
      const c = this.s[j]!;
      if (c === '"') inQuotes = !inQuotes;
      else if (c === "]" && !inQuotes) break;
      j++;
    }
    if (j >= this.s.length) return invalid(this.s.slice(start), start, 'unclosed "[" (prop needs a closing "]")');
    const inner = this.s.slice(start + 1, j);
    const operator = this.s.slice(start, j + 1);
    this.i = j + 1;
    const colon = inner.indexOf(":");
    if (colon < 0) return invalid(operator, start, "prop needs `name:value` ([p:] tests existence)");
    const name = inner.slice(0, colon).trim();
    if (!name) return invalid(operator, start, "prop needs a name");
    let value = inner.slice(colon + 1).trim();
    value = unquote(value);
    if (!value) return { node: { kind: "propExists", name } };
    const cmp = /^(<=|>=|!=|<>|<|>|=)([\s\S]*)$/.exec(value);
    if (cmp) {
      const op = (cmp[1] === "<>" ? "!=" : cmp[1]) as PropCompareOp;
      const v = cmp[2]!.trim();
      if (!v) return invalid(operator, start, "comparator needs a value");
      return { node: { kind: "propCompare", name, op, value: v } };
    }
    if (value.toLowerCase() === "null") return { node: { kind: "propMissing", name } };
    return { node: { kind: "prop", name, value } };
  }

  private parseFilterOrText(start: number): StepNullable {
    // Scan one token: whitespace/`"` end it; parens end it only at a
    // boundary (edge-adjacent parens group: `(a OR b)`), while mid-token
    // parens stay literal (`@due(2026-09-25)` is one term — balanced spans
    // skip together so the closing `)` stays literal too).
    // A quoted filter value (`file:"a b"`) extends past spaces.
    const isWs = (ch: string | undefined): boolean => ch !== undefined && /[ \t\n]/.test(ch);
    let j = start;
    while (j < this.s.length) {
      const c = this.s[j]!;
      // A quote right after `name:` opens a quoted value that may hold
      // spaces (`file:"a b"`); any other quote ends the token.
      if (c === '"') {
        if (j > start && this.s[j - 1] === ":") {
          const close = this.s.indexOf('"', j + 1);
          j = close < 0 ? this.s.length : close + 1;
          continue;
        }
        break;
      }
      if (isWs(c)) break;
      if (c === "(" || c === ")") {
        if (j === start) break;
        const prevB = isWs(this.s[j - 1]) || this.s[j - 1] === "(" || this.s[j - 1] === ")";
        const nextB = j + 1 >= this.s.length || isWs(this.s[j + 1]) || this.s[j + 1] === "(" || this.s[j + 1] === ")";
        if (c === "(") {
          if (prevB || nextB) break;
          let d = 1;
          let k = j + 1;
          while (k < this.s.length && d > 0) {
            if (this.s[k] === "(") d++;
            else if (this.s[k] === ")") d--;
            k++;
          }
          j = k;
          continue;
        }
        if (nextB || prevB) break;
        j++;
        continue;
      }
      j++;
    }
    let token = this.s.slice(start, j);
    const colon = token.indexOf(":");
    if (colon <= 0) {
      if (!token) return { node: null };
      // Bare uppercase AND/OR at operand position stay plain text.
      this.i = j;
      return { node: { kind: "text", value: token.toLowerCase() } };
    }
    const name = token.slice(0, colon);
    let rawValue = token.slice(colon + 1);
    if (!isOpChar(name[0]!) || !isOperatorShape(name, token)) {
      this.i = j;
      return { node: { kind: "text", value: token.toLowerCase() } };
    }
    const lname = name.toLowerCase();
    if (!KNOWN_FILTERS.has(lname)) {
      return invalid(token, start, `unsupported search operator "${lname}"`);
    }
    // Quoted value with spaces: extend the token to the closing quote
    // (unterminated runs to the end of the query).
    if (rawValue.startsWith('"')) {
      const qstart = start + colon + 1;
      const close = this.s.indexOf('"', qstart + 1);
      const end = close < 0 ? this.s.length : close + 1;
      token = this.s.slice(start, end);
      rawValue = this.s.slice(qstart + 1, close < 0 ? end : close);
      this.i = end;
    } else {
      this.i = j;
    }
    const v = unquote(rawValue).toLowerCase();
    const rawV = unquote(rawValue);
    switch (lname) {
      case "file":
      case "path":
      case "content":
      case "section":
      case "task":
      case "block":
      case "ignore-case":
        if (!v) return { node: { kind: "true" } };
        if (lname === "file") return { node: { kind: "file", value: v } };
        if (lname === "path") return { node: { kind: "path", value: v } };
        if (lname === "content") return { node: { kind: "content", value: v } };
        if (lname === "section") return { node: { kind: "section", value: v } };
        if (lname === "task") return { node: { kind: "task", value: v } };
        if (lname === "block") return { node: { kind: "block", value: v } };
        return { node: { kind: "ignoreCase", value: v } };
      case "match-case":
        if (!rawV) return { node: { kind: "true" } };
        return { node: { kind: "matchCase", value: rawV } };
      case "tag": {
        if (!v) return { node: { kind: "true" } };
        const t = normalizeTagValue(v);
        if (!t) return { node: { kind: "true" } };
        return { node: { kind: "tag", value: t } };
      }
      case "type":
        if (!v) return { node: { kind: "true" } };
        return { node: { kind: "type", value: v } };
      case "is":
        if (v === "task") return { node: { kind: "isTask" } };
        return invalid(token, start, `unsupported "is:" value (only "is:task")`);
      case "task-todo":
        if (!v) return { node: { kind: "taskTodo" } };
        return { node: { kind: "taskTodo", value: v } };
      case "task-done":
        if (!v) return { node: { kind: "taskDone" } };
        return { node: { kind: "taskDone", value: v } };
      case "line": {
        if (!/^\d+$/.test(v)) return invalid(token, start, `"line:" needs an integer >= 1`);
        const n = Number(v);
        if (!Number.isSafeInteger(n) || n < 1) return invalid(token, start, `"line:" needs an integer >= 1`);
        return { node: { kind: "line", n } };
      }
      default:
        return invalid(token, start, `unsupported search operator "${lname}"`);
    }
  }
}

export function parseSearchQuery(raw: string): SearchParseResult {
  return new Parser(raw).parse();
}

/** Structural helpers shared with matching + Collections. */

/** True when the query carries no constraint (empty / only `true` nodes). */
export function isEmptyQuery(q: SearchQuery): boolean {
  if (q.kind === "true") return true;
  if (q.kind === "and") return q.children.every(isEmptyQuery);
  return false;
}

/** True when the query positively names files (`word`/`"phrase"`/`/re/`/
 * `file:` outside any negation) — the filename-side listing gate. */
export function hasPositiveNameTerm(q: SearchQuery, negated = false): boolean {
  switch (q.kind) {
    case "text":
    case "phrase":
    case "regex":
    case "file":
      return !negated;
    case "not":
      return hasPositiveNameTerm(q.child, true);
    case "and":
    case "or":
      return q.children.some((c) => hasPositiveNameTerm(c, negated));
    default:
      return false;
  }
}

/** Positive (non-negated) text-like values for tiers + snippets. */
export function collectPositiveTerms(q: SearchQuery, negated = false): { texts: string[]; regexes: RegExp[] } {
  const texts: string[] = [];
  const regexes: RegExp[] = [];
  const walk = (n: SearchNode, neg: boolean): void => {
    switch (n.kind) {
      case "text":
      case "phrase":
      case "content":
      case "section":
      case "task":
      case "ignoreCase":
        if (!neg) texts.push(n.value);
        break;
      case "matchCase":
        if (!neg) texts.push(n.value.toLowerCase());
        break;
      case "taskTodo":
      case "taskDone":
        if (!neg && n.value) texts.push(n.value);
        break;
      case "regex":
        if (!neg) regexes.push(n.regex);
        break;
      case "not":
        walk(n.child, true);
        break;
      case "and":
      case "or":
        for (const c of n.children) walk(c, neg);
        break;
      default:
        break;
    }
  };
  walk(q, negated);
  return { texts, regexes };
}

/** True when task-scoped selectors occur positively (snippet preference). */
export function hasPositiveTaskSelector(q: SearchQuery, negated = false): boolean {
  switch (q.kind) {
    case "isTask":
    case "task":
    case "taskTodo":
    case "taskDone":
      return !negated;
    case "not":
      return hasPositiveTaskSelector(q.child, true);
    case "and":
    case "or":
      return q.children.some((c) => hasPositiveTaskSelector(c, negated));
    default:
      return false;
  }
}
