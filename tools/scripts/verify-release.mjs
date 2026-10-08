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
for (const f of ["dist-electron/main/index.cjs", "dist-electron/preload/index.cjs", "dist/renderer/index.html", "dist-helper/helper.cjs", "dist-server/server.cjs", "dist-mcp/takenotes-mcp.cjs"]) {
  if (!existsSync(f)) {
    console.error(`Missing build artifact: ${f}`);
    process.exit(1);
  }
}
// Multi-OS release. Installer names come from electron-builder
// `artifactName` (takenotes-${version}-${os}-${arch}.${ext}):
//   takenotes-0.1.10-win-x64.exe (NSIS installer — the in-app updater target)
//   takenotes-0.1.10-win-x64.zip (portable fallback)
//   takenotes-0.1.10-mac-x64.dmg / -mac-arm64.dmg
//   takenotes-0.1.10-linux-x86_64.AppImage / -linux-x64.deb
const releaseFiles = existsSync("release") ? readdirSync("release") : [];
const has = (re) => releaseFiles.find((f) => re.test(f));
const winInstaller = has(/\.exe$/);
const winPortable = has(/win.*\.zip$/);
const macIntel = has(/mac-x64\.dmg$/);
const macArm = has(/mac-arm64\.dmg$/);
const linuxAppImage = has(/\.AppImage$/);
const linuxDeb = has(/\.deb$/);
if (process.env.REQUIRE_INSTALLER === "1") {
  const missing = [];
  if (!winInstaller) missing.push("*.exe (Windows NSIS)");
  if (!winPortable) missing.push("*win*.zip (Windows portable)");
  if (!macIntel) missing.push("*mac-x64.dmg (macOS Intel)");
  if (!macArm) missing.push("*mac-arm64.dmg (macOS Apple Silicon)");
  if (!linuxAppImage) missing.push("*.AppImage (Linux portable)");
  if (!linuxDeb) missing.push("*.deb (Linux deb)");
  if (missing.length > 0) {
    console.error(`Missing installers in release/: ${missing.join(", ")}. Found: ${releaseFiles.join(", ") || "(empty)"}`);
    process.exit(1);
  }
}
console.log(
  `Release verification OK for ${pkg.version}. ` +
    `win-exe=${winInstaller ?? "(not required)"} win-zip=${winPortable ?? "(not required)"} ` +
    `mac-x64=${macIntel ?? "(not required)"} mac-arm64=${macArm ?? "(not required)"} ` +
    `appimage=${linuxAppImage ?? "(not required)"} deb=${linuxDeb ?? "(not required)"}`,
);
