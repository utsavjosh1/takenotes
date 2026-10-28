// Counts what the migration set out to remove. Target for every line is 0.
// Usage: node tools/scripts/audit-ui.mjs [--json]
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const SKIP = /(^|\/)(node_modules|dist[\w-]*|build|design|new|docs|\.agents|\.claude|\.expo|storybook-static)(\/|$)/;
function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (SKIP.test(relative(root, p).replaceAll("\\", "/"))) return [];
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = ["apps", "packages"].flatMap((d) => walk(join(root, d)));
const rel = (f) => relative(root, f).replaceAll("\\", "/");
const TOKEN_FILES = new Set(["packages/ui/src/tokens.css", "packages/ui/src/generated.ts", "packages/ui/src/theme.ts", "packages/ui/src/dom/icon-data.ts",
  "apps/web/src/brand.css", "apps/desktop/src/renderer/styles/tokens.css", "packages/core/src/appearance/appearance.ts"]);
const css = files.filter((f) => f.endsWith(".css") && !TOKEN_FILES.has(rel(f)));
// Main-process code and <meta theme-color> must be literal colours (OS APIs, no CSS).
const code = files.filter((f) => /\.tsx?$/.test(f) && !rel(f).startsWith("apps/desktop/src/main/") && !f.endsWith(".d.ts") && !TOKEN_FILES.has(rel(f)) && !/\.stories\.tsx$/.test(f));
const text = (f) => readFileSync(f, "utf8");
const count = (list, re) => list.reduce((n, f) => n + (text(f).match(re) ?? []).length, 0);

const result = {
  "raw hex colours in CSS": count(css, /#[0-9a-f]{3,8}\b/gi),
  "raw rgb()/hsl() in CSS": count(css, /\b(?:rgba?|hsla?)\(/g),
  "raw hex colours in TS/TSX/HTML": count(code, /["'`]#[0-9a-f]{3,8}\b/gi),
  "one-off px border-radius in CSS": count(css, /radius[a-z-]*:\s*[^;}]*\b[1-9]\d*(?:\.\d+)?px/g),
  "!important outside documented resets": "checked by npm run lint:css",
  "numeric z-index in CSS": count(css, /z-index:\s*-?\d/g),
  "local copies of shared components": files.filter((f) => /^apps\/(desktop|web|server)\//.test(rel(f)) && /\.tsx?$/.test(f))
    .reduce((n, f) => n + (text(f).match(/(?:function|const)\s+(?:Button|IconButton|Input|Select|Textarea|Switch|Checkbox|Chip|Badge|Pill|Card|Dialog|ConfirmDialog|ErrorDialog|Menu|MenuItem|Popover|Tooltip|Toast|Banner|Notice|Tabs|Skeleton|Progress|Stepper|DataTable|CommandPalette|Rail)\b/g) ?? []).length, 0),
  "banned words in interface text (see tests/ui/jargon.test.ts)": "checked by test",
  "old UI libraries or CSS-in-JS in package.json": readdirSync(root).includes("package.json")
    ? (text(join(root, "package.json")).match(/"(@mui\/[^"]+|antd|@chakra-ui\/[^"]+|styled-components|@emotion\/[^"]+|tailwindcss|lucide-react|react-icons)"/g) ?? []).length : 0,
};
if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
else for (const [k, v] of Object.entries(result)) console.log(`${String(v).padStart(6)}  ${k}`);
