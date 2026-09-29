/**
 * Pure update-version logic (stable channel only).
 * No Electron imports — fully unit-tested in tests/update/version.test.ts.
 *
 * Channel rule: only `vX.Y.Z` tags are offered. Prerelease tags
 * (`vX.Y.Z-beta`, `-rc`) are never auto-offered; `releases/latest` on
 * GitHub already excludes drafts + prereleases, and the tag guard below
 * enforces the same invariant on anything the network hands us.
 */

export type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
};

/** Parse a release tag (`v1.2.3`) or bare version (`1.2.3`). Returns null
 *  for anything else — prereleases, garbage, empty. Never throws. */
export function parseVersion(input: unknown): ParsedVersion | null {
  if (typeof input !== "string") return null;
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(input.trim());
  if (!m) return null;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3]);
  if (!Number.isSafeInteger(major) || !Number.isSafeInteger(minor) || !Number.isSafeInteger(patch)) return null;
  return { major, minor, patch };
}

/** Numeric SemVer comparison. */
export function compareVersions(a: ParsedVersion, b: ParsedVersion): -1 | 0 | 1 {
  for (const k of ["major", "minor", "patch"] as const) {
    if (a[k] < b[k]) return -1;
    if (a[k] > b[k]) return 1;
  }
  return 0;
}

/** True when `latestTag` is a stable release strictly newer than `current`.
 *  Unparseable input (either side) means "no update" — never offer an
 *  update we cannot reason about. */
export function isNewerRelease(latestTag: unknown, current: unknown): boolean {
  const latest = parseVersion(latestTag);
  const cur = parseVersion(current);
  if (!latest || !cur) return false;
  return compareVersions(latest, cur) === 1;
}

/** Windows installer asset name for a version, matching electron-builder
 *  `artifactName: takenotes-${version}-${os}-${arch}.${ext}` on win/x64. */
export function windowsInstallerName(version: string): string {
  const v = version.startsWith("v") ? version.slice(1) : version;
  return `takenotes-${v}-win-x64.exe`;
}

/** Extract the SHA-256 hex for `fileName` from a `SHA256SUMS.txt` body.
 *  Accepts both `hash  name` and `hash *name` line styles. Null when absent. */
export function parseChecksumFile(body: unknown, fileName: string): string | null {
  if (typeof body !== "string" || typeof fileName !== "string" || fileName === "") return null;
  for (const line of body.split("\n")) {
    const m = /^([a-fA-F0-9]{64})\s+\*?(\S+)\s*$/.exec(line.trim());
    if (m && m[2] === fileName) return m[1]!.toLowerCase();
  }
  return null;
}
