/** Release gate: tag matches version, CHANGELOG has the release, artifacts exist. */
import { existsSync, readFileSync, readdirSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const tag = process.env.GITHUB_REF_NAME ?? process.argv[2] ?? null;
if (tag) {
  const expected = tag.startsWith("v") ? tag.slice(1) : tag;
  if (pkg.version !== expected) {
    console.error(`Tag/version mismatch: tag=${tag} package=${pkg.version}`);
    process.exit(1);
  }
}
const changelog = readFileSync("CHANGELOG.md", "utf8");
if (!changelog.includes(`## [${pkg.version}]`)) {
  console.error(`CHANGELOG.md has no section for [${pkg.version}]`);
  process.exit(1);
}
for (const f of ["dist-electron/main/index.js", "dist-electron/preload/index.js", "dist/renderer/index.html", "dist-helper/helper.cjs"]) {
  if (!existsSync(f)) {
    console.error(`Missing build artifact: ${f}`);
    process.exit(1);
  }
}
const releaseFiles = existsSync("release") ? readdirSync("release") : [];
const installer = releaseFiles.find((f) => f.endsWith("-setup.exe"));
if (process.env.REQUIRE_INSTALLER === "1" && !installer) {
  console.error("Missing Windows installer in release/ (REQUIRE_INSTALLER=1).");
  process.exit(1);
}
console.log(`Release verification OK for ${pkg.version}. Installer: ${installer ?? "(not required in this environment)"}`);
