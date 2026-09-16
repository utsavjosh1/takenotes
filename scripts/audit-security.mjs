/** Static security invariants. Fails on BLOCKER patterns outside approved tests/fixtures.
 * Run: npm run audit:security */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = ["src/main", "src/preload", "src/renderer", "wsl-helper/src"];

function files(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

/** pattern, message, allowIf (path fragment that exempts a match) */
const BLOCKERS = [
  [/nodeIntegration:\s*true/, "nodeIntegration:true", ""],
  [/contextIsolation:\s*false/, "contextIsolation:false", ""],
  [/sandbox:\s*false/, "sandbox:false", ""],
  [/webSecurity:\s*false/, "webSecurity:false", ""],
  [/allowRunningInsecureContent:\s*true/, "allowRunningInsecureContent", ""],
  [/shell:\s*true/, "shell:true in spawn", ""],
  [/ipcRenderer\.(send|invoke|on)\b/, "generic ipcRenderer exposure outside preload", "src/preload"],
  [/require\(\s*[^)]*\)/, "dynamic require", ""],
  [/\beval\(/, "eval()", ""],
  [/new Function\(/, "new Function", ""],
  [/dangerouslySetInnerHTML/, "dangerouslySetInnerHTML", ""],
  [/wsl\s+--shutdown/, "wsl --shutdown", ""],
];

let failures = 0;
for (const dir of SRC) {
  for (const f of files(path.join(ROOT, dir))) {
    const text = readFileSync(f, "utf8");
    // Strip comments so prohibitions documented in comments don't false-positive.
    const code = text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n");
    for (const [re, msg, allow] of BLOCKERS) {
      if (allow && f.includes(allow)) continue;
      // shell:true is only reviewed for spawn sites; object literals named shell elsewhere are fine.
      if (re.source.startsWith("shell") && !/spawn\(/.test(code)) continue;
      if (re.test(code)) {
        console.error(`BLOCKER ${msg}: ${path.relative(ROOT, f)}`);
        failures++;
      }
    }
  }
}

// Network imports are additionally enforced by eslint no-restricted-imports;
// double-check here for the audit trail.
const NET = /from\s+["']node:(http|https|net|tls|dgram)["']|require\(["']node:(http|https|net|tls|dgram)["']\)/;
for (const dir of ["src/main", "wsl-helper/src"]) {
  for (const f of files(path.join(ROOT, dir))) {
    if (NET.test(readFileSync(f, "utf8"))) {
      console.error(`BLOCKER network import: ${path.relative(ROOT, f)}`);
      failures++;
    }
  }
}

if (failures > 0) {
  console.error(`audit:security FAIL (${failures} blocker match(es))`);
  process.exit(1);
}
console.log("audit:security PASS (static invariants hold)");
