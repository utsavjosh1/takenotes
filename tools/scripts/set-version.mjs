/** Validate + set semantic version in package.json and package-lock.json.
 * Usage: npm run version:set -- 0.2.0 (does not tag, commit, or publish). */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const next = process.argv[2];
if (!next || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(next)) {
  console.error("Usage: npm run version:set -- <semver>  (e.g. 0.2.0)");
  process.exit(1);
}
execFileSync("npm", ["version", next, "--no-git-tag-version"], { stdio: "inherit" });
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
if (pkg.version !== next || lock.version !== next) {
  console.error(`Version mismatch after set: package.json=${pkg.version} lock=${lock.version} expected=${next}`);
  process.exit(1);
}
console.log(`Version set to ${next} (package.json + package-lock.json agree).`);
