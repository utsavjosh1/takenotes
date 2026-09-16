/** Dead-code tripwires: fails if known-removed patterns reappear or new
 * suspicious leftovers land. Run: npm run audit:deadcode */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
let failures = 0;
const fail = (m) => {
  console.error(`DEADCODE ${m}`);
  failures++;
};

// 1. Removed implementations must stay removed.
for (const p of ["src/renderer/commands", "src-tauri", "Cargo.toml", "src/main/files"]) {
  if (existsSync(path.join(ROOT, p))) fail(`obsolete path still present: ${p}`);
}

// 2. Declared-but-unimplemented helper ops must not creep back into the contract.
const protocol = readFileSync(path.join(ROOT, "src/shared/protocol.ts"), "utf8");
for (const op of ["file.rename", "file.trash", "file.restore", "search.start", "watch.subscribe"]) {
  if (protocol.includes(`"${op}"`)) fail(`unimplemented helper op in contract: ${op}`);
}

// 3. Legacy component names (sidebar/editor relics) must not exist.
function files(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) files(p, out);
    else out.push(p);
  }
  return out;
}
for (const f of files(path.join(ROOT, "src"))) {
  if (/OldSidebar|SidebarV1|TestEditor|LegacySettings|DemoPage|OldWorkspace/i.test(f)) {
    fail(`legacy component file: ${path.relative(ROOT, f)}`);
  }
}

// 4. Every preload method must have at least one renderer caller.
const preload = readFileSync(path.join(ROOT, "src/preload/index.ts"), "utf8");
const methods = [...preload.matchAll(/^\s{4}(\w+):\s*\(/gm)].map((m) => m[1]);
const renderer = files(path.join(ROOT, "src/renderer")).map((f) => readFileSync(f, "utf8")).join("\n");
for (const m of new Set(methods)) {
  if (["openLocal", "close", "listWslDistributions", "connectWsl", "list", "read", "write", "create", "rename", "trash", "files", "content", "version", "onWslState"].includes(m)) continue;
  if (!renderer.includes(`.${m}(`) && !renderer.includes(`${m}(`)) fail(`preload method without renderer caller: ${m}`);
}

if (failures > 0) {
  console.error(`audit:deadcode FAIL (${failures} finding(s))`);
  process.exit(1);
}
console.log("audit:deadcode PASS (no dead-code tripwires triggered)");
