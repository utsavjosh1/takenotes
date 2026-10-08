/** Extract the CHANGELOG section for the current version as release notes. */
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const changelog = readFileSync("CHANGELOG.md", "utf8");
const lines = changelog.split("\n");
const start = lines.findIndex((l) => l.startsWith(`## [${pkg.version}]`));
if (start < 0) {
  console.error(`No CHANGELOG section for [${pkg.version}]`);
  process.exit(1);
}
let end = lines.findIndex((l, i) => i > start && l.startsWith("## ["));
if (end < 0) end = lines.length;
const section = lines.slice(start, end).join("\n").trim();
const body = `${section}

## Downloads

Installers only — no source archives beyond GitHub's automatic ones:

- **Windows 11 x64:** \`takenotes-${pkg.version}-win-x64.exe\` (NSIS installer, run and follow prompts).
- **Windows 11 x64 portable:** \`takenotes-${pkg.version}-win-x64.zip\`.
- **macOS Intel:** \`takenotes-${pkg.version}-mac-x64.dmg\`.
- **macOS Apple Silicon:** \`takenotes-${pkg.version}-mac-arm64.dmg\`.
- **Ubuntu/Debian x64:** \`takenotes-${pkg.version}-linux-x86_64.AppImage\` (portable, \`chmod +x\` then run) or \`takenotes-${pkg.version}-linux-x64.deb\`.

WSL features require WSL2 with Ubuntu 22.04 x64 or Ubuntu 24.04 x64.
Early builds are unsigned: Windows SmartScreen warnings are expected — choose
Run anyway. On macOS, right-click the app → Open on first launch (unsigned
beta — Gatekeeper blocks a plain double-click). In-app updates use GitHub Releases.

## Checksums & provenance

Verify downloads against \`SHA256SUMS.txt\` attached to this release.
Node-dependency SBOM is attached as \`*.spdx.json\`.
`;
process.stdout.write(body + "\n");
