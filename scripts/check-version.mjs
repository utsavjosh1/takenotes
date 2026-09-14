/** Verify package.json version matches package-lock.json and (in release) the git tag. */
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
if (pkg.version !== lock.version) {
  console.error(`Version mismatch: package.json=${pkg.version} package-lock.json=${lock.version}`);
  process.exit(1);
}
const tag = process.env.GITHUB_REF_NAME ?? process.env.RELEASE_TAG ?? null;
if (tag) {
  const expected = tag.startsWith("v") ? tag.slice(1) : tag;
  // Allow prerelease tags like v0.2.0-beta.1 to map to the same base check.
  if (pkg.version !== expected) {
    console.error(`Tag/version mismatch: tag=${tag} package=${pkg.version}`);
    process.exit(1);
  }
}
console.log(`Version check OK: ${pkg.version}`);
