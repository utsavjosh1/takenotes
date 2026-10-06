/** Decode `wsl.exe --list --quiet` output which may be UTF-8, UTF-16LE, carry a
 * BOM, and contain NUL characters. Returns clean distribution names. */
export function decodeWslListOutput(raw: Buffer): string[] {
  return decodeWslText(raw)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** Structured distro record from `wsl.exe -l -v`. `state`/`version` are
 * absent on the `--list --quiet` fallback path (names only). */
export type VerboseDistribution = {
  name: string;
  state?: string;
  version?: string;
  isDefault?: boolean;
};

/** Decode raw `wsl.exe` list bytes (UTF-16LE with BOM, UTF-16LE without BOM,
 * or UTF-8) to clean text. Shared by both list parsers. */
function decodeWslText(raw: Buffer): string {
  let text: string;
  if (raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe) {
    text = raw.subarray(2).toString("utf16le");
  } else if (raw.includes(0)) {
    // Heuristic: interleaved NULs => UTF-16LE without BOM.
    const odd = raw.filter((_, i) => i % 2 === 1);
    const oddAllZero = odd.every((b) => b === 0);
    text = oddAllZero ? raw.toString("utf16le") : raw.toString("utf8");
  } else {
    text = raw.toString("utf8");
  }
  // Strip BOM + NULs.
  return text.replace(/^\uFEFF/, "").replace(/\0/g, "");
}

/** Header guard shared by the verbose parser and the list-shape check:
 * first line reads `NAME … STATE …` (localized builds vary; require at
 * least NAME + STATE positionally so garbage is never parsed as distros). */
function hasVerboseHeader(firstLine: string): boolean {
  const header = firstLine.trim().toUpperCase();
  return header.startsWith("NAME") && header.includes("STATE");
}

/** True when raw bytes decode to a recognizable verbose-list shape (NAME…
 * header present), even with zero distro rows — i.e. "no distros installed"
 * is a genuine answer, not a parse failure. Never throws. */
export function isVerboseListShape(raw: Buffer): boolean {
  try {
    return hasVerboseHeader(decodeWslText(raw).split(/\r?\n/)[0] ?? "");
  } catch {
    return false;
  }
}

/** Parse `wsl.exe -l -v` output into distro records.
 *
 * Handles the `*` default marker, Running/Stopped states, WSL 1/2 versions,
 * names with spaces, and UTF-16LE BOM output. Returns [] when the output
 * is not a recognizable verbose list (empty, header-only, or malformed) so
 * the caller can fall back to `--list --quiet`. Never throws. */
export function parseWslVerboseList(raw: Buffer): VerboseDistribution[] {
  const lines = decodeWslText(raw).split(/\r?\n/);
  if (lines.length === 0) return [];
  if (!hasVerboseHeader(lines[0] ?? "")) return [];
  const out: VerboseDistribution[] = [];
  for (const line of lines.slice(1)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const isDefault = trimmed.startsWith("*");
    const body = (isDefault ? trimmed.slice(1) : trimmed).trim();
    // Columns are whitespace-separated; the name may itself contain spaces,
    // so split from the right: last token = version, one before = state.
    const parts = body.split(/\s+/);
    if (parts.length < 3) continue;
    const version = parts[parts.length - 1]!;
    const state = parts[parts.length - 2]!;
    const name = parts.slice(0, -2).join(" ");
    if (name.length === 0 || name.length > 128) continue;
    // State/version cells are single tokens; anything else is a broken row.
    if (!/^[A-Za-z]+$/.test(state) || !/^\d+$/.test(version)) continue;
    out.push({ name, state, version, isDefault });
  }
  return out;
}
