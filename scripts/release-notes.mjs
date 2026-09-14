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

## Supported systems

- Windows 11 x64
- WSL2 with Ubuntu 22.04 x64 or Ubuntu 24.04 x64

## Installation

Download \`takenotes-${pkg.version}-windows-x64-setup.exe\` and run it.
Unsigned early builds may trigger Windows SmartScreen warnings.

## Checksums

See \`SHA256SUMS.txt\` attached to this release.
`;
process.stdout.write(body + "\n");
