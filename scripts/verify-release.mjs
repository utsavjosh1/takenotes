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
// Installer names come from electron-builder `artifactName`
// (takenotes-${version}-${os}-${arch}.${ext}):
//   win   -> takenotes-0.0.1-win-x64.exe
//   mac   -> takenotes-0.0.1-mac-arm64.dmg / takenotes-0.0.1-mac-x64.dmg
//   linux -> takenotes-0.0.1-linux-x86_64.AppImage, -linux-amd64.deb, -linux-x86_64.rpm
const releaseFiles = existsSync("release") ? readdirSync("release") : [];
const has = (re) => releaseFiles.find((f) => re.test(f));
const winInstaller = has(/\.exe$/);
const macInstaller = has(/\.dmg$/);
const linuxInstaller = has(/\.(AppImage|deb|rpm)$/);
if (process.env.REQUIRE_INSTALLER === "1") {
  const missing = [];
  if (!winInstaller) missing.push("*.exe (Windows NSIS)");
  if (!macInstaller) missing.push("*.dmg (macOS)");
  if (!linuxInstaller) missing.push("*.AppImage/*.deb/*.rpm (Linux)");
  if (missing.length > 0) {
    console.error(`Missing installers in release/: ${missing.join(", ")}. Found: ${releaseFiles.join(", ") || "(empty)"}`);
    process.exit(1);
  }
}
console.log(
  `Release verification OK for ${pkg.version}. ` +
    `win=${winInstaller ?? "(not required)"} mac=${macInstaller ?? "(not required)"} linux=${linuxInstaller ?? "(not required)"}`,
);
