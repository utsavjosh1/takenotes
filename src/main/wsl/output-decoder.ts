/** Decode `wsl.exe --list --quiet` output which may be UTF-8, UTF-16LE, carry a
 * BOM, and contain NUL characters. Returns clean distribution names. */
export function decodeWslListOutput(raw: Buffer): string[] {
  let text: string;
  if (raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe) {
    text = raw.subarray(2).toString("utf16le");
  } else if (raw.includes(0)) {
    // Heuristic: interleaved NULs => UTF-16LE without BOM.
    const even = raw.filter((_, i) => i % 2 === 0);
    const odd = raw.filter((_, i) => i % 2 === 1);
    const oddAllZero = odd.every((b) => b === 0);
    text = oddAllZero ? raw.toString("utf16le") : raw.toString("utf8");
    void even;
  } else {
    text = raw.toString("utf8");
  }
  // Strip BOM + NULs, split lines, trim.
  text = text.replace(/^\uFEFF/, "").replace(/\0/g, "");
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}
