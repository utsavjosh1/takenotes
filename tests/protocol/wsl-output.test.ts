import { describe, expect, it } from "vitest";
import { decodeWslListOutput } from "../../src/main/wsl/output-decoder";

describe("wsl --list --quiet decoder", () => {
  it("parses plain UTF-8", () => {
    const out = decodeWslListOutput(Buffer.from("Ubuntu\nDebian\n", "utf8"));
    expect(out).toEqual(["Ubuntu", "Debian"]);
  });

  it("handles UTF-16LE with BOM", () => {
    const text = "Ubuntu\r\nDebian\r\n";
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
    expect(decodeWslListOutput(buf)).toEqual(["Ubuntu", "Debian"]);
  });

  it("handles UTF-16LE without BOM (NUL heuristic)", () => {
    const buf = Buffer.from("Ubuntu\r\n", "utf16le");
    expect(decodeWslListOutput(buf)).toEqual(["Ubuntu"]);
  });

  it("handles Unicode names and spaces", () => {
    const out = decodeWslListOutput(Buffer.from("Ubuntu 24.04\nMy Distro\ncafé\n", "utf8"));
    expect(out).toEqual(["Ubuntu 24.04", "My Distro", "café"]);
  });

  it("ignores blank lines and stray NULs", () => {
    const out = decodeWslListOutput(Buffer.from("\nUbuntu\n\n\0", "utf8"));
    expect(out).toEqual(["Ubuntu"]);
  });
});
