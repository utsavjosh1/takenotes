/** Generate a large-workspace fixture for benchmarks (NOT committed).
 * Usage: node scripts/generate-fixture.mjs [outDir] — default tests/fixtures/generated/large */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const outDir = process.argv[2] ?? path.join("tests", "fixtures", "generated", "large");
const FILE_COUNT = 10000;
mkdirSync(outDir, { recursive: true });

const words = ["inbox", "todo", "notes", "architecture", "linux", "networking", "journal", "project", "meeting", "idea"];
let written = 0;
for (let i = 0; i < FILE_COUNT; i++) {
  const dir = path.join(outDir, `dir-${String(Math.floor(i / 500)).padStart(3, "0")}`);
  mkdirSync(dir, { recursive: true });
  const name = `${words[i % words.length]}-${i}.md`;
  const body = `# Note ${i}\n\n${"Lorem ipsum dolor sit amet. ".repeat(20)}\n`;
  writeFileSync(path.join(dir, name), body);
  written++;
}
// Unicode + spaces sample
mkdirSync(path.join(outDir, "café notes"), { recursive: true });
writeFileSync(path.join(outDir, "café notes", "ünïcode file.md"), "# unicode\n");
writeFileSync(path.join(outDir, "my notes", "with spaces.md"), "# spaces\n");
console.log(`Wrote ${written} fixture files to ${outDir} (not for commit).`);
