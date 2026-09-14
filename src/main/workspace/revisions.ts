import { createHash } from "node:crypto";

export type FileRevision = { hash: string; size: number; mtimeMs: number };

export function revisionOfBytes(bytes: Buffer, mtimeMs: number): FileRevision {
  return {
    hash: createHash("sha256").update(bytes).digest("hex"),
    size: bytes.length,
    mtimeMs,
  };
}

/** Detect newline style; returns counts too for future heuristics. */
export function detectNewline(content: string): { newlineStyle: "lf" | "crlf"; crlf: number; lf: number } {
  const crlf = (content.match(/\r\n/g) ?? []).length;
  const totalLf = (content.match(/\n/g) ?? []).length;
  const lf = totalLf - crlf;
  return { newlineStyle: crlf > lf ? "crlf" : "lf", crlf, lf };
}

/** Split UTF-8 bytes with BOM handling. Returns null when bytes are not supported UTF-8. */
export function decodeUtf8(bytes: Buffer): { text: string; hadBom: boolean } | null {
  let hadBom = false;
  let slice = bytes;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    hadBom = true;
    slice = bytes.subarray(3);
  }
  // Reject NUL bytes (likely binary) for MVP.
  if (slice.includes(0)) return null;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(slice);
    return { text, hadBom };
  } catch {
    return null;
  }
}

/** Encode text back to bytes, preserving BOM + newline style. */
export function encodeUtf8(text: string, newlineStyle: "lf" | "crlf", hadBom: boolean, newFile: boolean): Buffer {
  let out = text;
  if (newlineStyle === "crlf") {
    out = out.replace(/\r\n|\n/g, "\r\n");
  } else if (!newFile) {
    // Preserve LF files as LF; normalize stray CRLF only when original was LF.
    out = out.replace(/\r\n/g, "\n");
  }
  const body = Buffer.from(out, "utf8");
  if (hadBom) return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body]);
  return body;
}
