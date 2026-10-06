/** Post-package gate: assert `win-unpacked/resources/app.asar` actually boots.
 *
 * Catches silent packaging omissions (empty `files` globs, moved outDirs,
 * files vite warns-but-drops like a non-module `<script src>`) BEFORE an
 * installer ships. The v0.0.4 white-screen class (`ERR_FILE_NOT_FOUND` for
 * `dist/renderer/index.html`) passes `release:verify` (pre-package `dist/`
 * exists) yet could still ship a bad asar — this checks the asar itself.
 *
 * Usage: `node scripts/verify-packaged.mjs [appAsarPath]`
 * Default: `release/win-unpacked/resources/app.asar` (CI layout after
 * `npm run package:win`). Exit 0 = all boot files present, else list missing.
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { listPackage } = require("@electron/asar");

const asarPath = process.argv[2] ?? "release/win-unpacked/resources/app.asar";

// Every entry is load-bearing at startup: main entry, preload, renderer
// document + its synchronous pre-paint script, and the version source.
const REQUIRED = [
  "/dist-electron/main/index.cjs",
  "/dist-electron/preload/index.cjs",
  "/dist/renderer/index.html",
  "/dist/renderer/theme-init.js",
  "/package.json",
];

/** Asar entry separators differ by platform (`/` on Linux CI probes,
 * `\` from `@electron/asar` on Windows): compare normalized. */
function normalizeAsarPath(p) {
  return p.replace(/\\/g, "/").replace(/^\/+/, "");
}

if (!existsSync(asarPath)) {
  console.error(`Missing packaged asar: ${asarPath} (run \`npm run package:win\` first)`);
  process.exit(1);
}

const present = new Set(listPackage(asarPath).map(normalizeAsarPath));
const missing = REQUIRED.filter((f) => !present.has(normalizeAsarPath(f)));
if (missing.length > 0) {
  // Self-diagnosing: a future mismatch prints what the asar actually holds.
  const sample = [...present].slice(0, 8).join("\n  ");
  console.error(
    `Packaged asar is missing boot files:\n  ${missing.join("\n  ")}\nAsar: ${asarPath} (${present.size} entries; e.g.\n  ${sample})`,
  );
  process.exit(1);
}
console.log(`Packaged asar OK: ${asarPath} (${present.size} entries, all ${REQUIRED.length} boot files present)`);
