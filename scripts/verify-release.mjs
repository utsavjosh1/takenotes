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
for (const f of ["dist-electron/main/index.cjs", "dist-electron/preload/index.cjs", "dist/renderer/index.html", "dist-helper/helper.cjs"]) {
  if (!existsSync(f)) {
    console.error(`Missing build artifact: ${f}`);
    process.exit(1);
  }
}
// Windows-only release. Installer names come from electron-builder
// `artifactName` (takenotes-${version}-${os}-${arch}.${ext}):
//   takenotes-0.0.1-win-x64.exe (NSIS installer — the in-app updater target)
//   takenotes-0.0.1-win-x64.zip (portable fallback)
const releaseFiles = existsSync("release") ? readdirSync("release") : [];
const has = (re) => releaseFiles.find((f) => re.test(f));
const winInstaller = has(/\.exe$/);
const winPortable = has(/\.zip$/);
if (process.env.REQUIRE_INSTALLER === "1") {
  const missing = [];
  if (!winInstaller) missing.push("*.exe (Windows NSIS)");
  if (!winPortable) missing.push("*.zip (Windows portable)");
  if (missing.length > 0) {
    console.error(`Missing installers in release/: ${missing.join(", ")}. Found: ${releaseFiles.join(", ") || "(empty)"}`);
    process.exit(1);
  }
}
console.log(
  `Release verification OK for ${pkg.version}. ` +
    `win-exe=${winInstaller ?? "(not required)"} win-zip=${winPortable ?? "(not required)"}`,
);
