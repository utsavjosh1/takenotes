/** Download the pinned official Node linux-x64 archive and verify SHA-256.
 * Writes to resources/wsl/linux-x64/generated/. Requires network. */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";

const config = JSON.parse(readFileSync("build-config.json", "utf8"));
const nodeVersion = config.wslRuntime.nodeVersion;
const base = config.wslRuntime.downloadBase;
const archive = `node-v${nodeVersion}-linux-x64.tar.xz`;
const archiveUrl = `${base}/v${nodeVersion}/${archive}`;
const sumsUrl = `${base}/v${nodeVersion}/SHASUMS256.txt`;

const outDir = path.join("resources", "wsl", "linux-x64", "generated");
mkdirSync(outDir, { recursive: true });

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${url} (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

console.log(`Fetching ${sumsUrl}`);
const sums = (await fetchBytes(sumsUrl)).toString("utf8");
const line = sums.split("\n").find((l) => l.trim().endsWith(archive));
if (!line) throw new Error(`Archive ${archive} not found in official SHASUMS256.txt`);
const expected = line.split(/\s+/)[0];
console.log(`Fetching ${archiveUrl}`);
const bytes = await fetchBytes(archiveUrl);
const actual = createHash("sha256").update(bytes).digest("hex");
if (actual !== expected) {
  throw new Error(`Checksum mismatch for ${archive}: expected ${expected}, got ${actual}`);
}
writeFileSync(path.join(outDir, archive), bytes);
writeFileSync(path.join(outDir, `${archive}.sha256`), `${expected}  ${archive}\n`);
console.log(`Verified ${archive} (sha256 ${expected})`);
