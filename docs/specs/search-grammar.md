# Search Grammar (V2)

Index-only query language over the parse-once document index
(`packages/core/src/search/`). The parser is total and deterministic:
it never throws and never touches the filesystem. Matching reads entry
fields only (`searchableText`, headings, tasks, tags, frontmatter);
per-file matching is capped (`MAX_CONTENT_SCAN_CHARS`), the file list
is capped (`MAX_FILES_SCANNED`), and regexes are statically rejected
before they can run.

## Grammar

```ebnf
query    ::= or_expr
or_expr  ::= and_expr ( "OR" and_expr )*        (* "OR" uppercase only *)
and_expr ::= unary ( ( "AND" )? unary )*        (* whitespace = AND *)
unary    ::= "-"* primary                       (* "-" prefix negation *)
primary  ::= "(" or_expr ")" | operand
operand  ::= phrase | regex | prop | filter | text
phrase   ::= '"' chars '"'                      (* unterminated " runs to end *)
regex    ::= "/" pattern "/"                    (* case-insensitive *)
prop     ::= "[" name ":" value "]"             (* frontmatter property *)
filter   ::= name ":" value                     (* known names only *)
text     ::= [^ \t\n()"]+                       (* no spaces, parens group *)
```

Precedence: `OR` < `AND` (implicit or explicit `AND`) < unary `-`.
So `a OR b c` parses as `a OR (b AND c)`, and `-a b` as `(-a) AND b`.

Parentheses group, including after negation: `-(a OR b)`. A paren in the
middle of a token stays literal text (`@due(2026-09-25)` is one text
term); whitespace-separated or edge-adjacent parens group (`(a OR b)`).
Unclosed `(` is `INVALID_REQUEST` naming `"("` with its position.

## Operands

| Form | Matches (case-insensitive) | Example |
|---|---|---|
| `word` | substring of indexed text | `mcp` |
| `"phrase"` | one exact-phrase term | `"server design"` |
| `/re/` | regex over indexed text | `/wire\s+helper/` |
| `file:v` | `v` in basename | `file:mcp` |
| `path:v` | `v` in relative path | `path:docs` |
| `tag:v` | normalized tag (no `#`) | `tag:backend` |
| `type:v` | exact doc type | `type:daily` |
| `is:task` | file has ≥1 task | `is:task wire` |
| `content:v` | `v` in body/indexed text | `content:websocket` |
| `section:v` | `v` in a heading or title | `section:guide` |
| `task-todo:v` | `v` in an open task (`-todo:` alone = has open task) | `task-todo:wire` |
| `task-done:v` | `v` in a completed task (`-done:` alone = has done task) | `task-done:review` |
| `line:n` | file has ≥ `n` lines (`n` ≥ 1) | `line:7` |
| `[p:v]` | frontmatter prop `p` contains `v` (`[p:]` = prop exists) | `[status:done]` |

Quoted values may hold spaces: `file:"MCP Architecture"`,
`content:"exact phrase"`, `[title:"My Note"]`.

`-` negates any operand or group: `-mcp`, `-"exact"`, `-/re/`,
`-file:x`, `-(a OR b)`, `-task-todo:wire`, `-[status:done]`.
A lone `-`, lowercase `and`/`or`/`not`, URLs (`https://…`), times
(`12:30`), and `dotted.names:…` stay plain text.

## Errors

Unknown `name:value` operators are `INVALID_REQUEST` naming the operator
token **and** its 0-based character position, e.g. `due:tomorrow` →
`{ operator: "due:tomorrow", position: 0 }`. Same for bad values
(`is:done`, `line:abc`, `line:0`), bad regexes (too long, unsafe,
uncompilable), and malformed `[p:v]` / `(`/`)`.

## Safety caps

- `MAX_REGEX_PATTERN_LEN = 200` — longer patterns rejected.
- Nested quantifiers rejected: a group containing `+`/`*`/`{` and itself
  quantified, e.g. `(a+)+$`, `(a*)*`, `(x+x+)+y`. Rejection is a
  sub-millisecond string scan at parse time.
- `MAX_CONTENT_SCAN_CHARS = 20000` — per-file match haystack cap.
- `MAX_FILES_SCANNED = 5000` — entries scanned per query (path order).

## Content vs filename search

`searchContent` evaluates the whole query per entry. `searchFilenames`
evaluates the same query but scopes `word`/`"phrase"`/`/re/` to
`relativePath + title + basename`, and lists nothing unless the query
has a positively-occurring name term (`word`, `"phrase"`, `/re/`,
`file:`) — pure filters (`path:`, `tag:`, `content:`, …) select no
filenames. Both rank deterministically and return honest file lines.
