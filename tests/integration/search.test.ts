import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { searchWorkspace } from "../../src/main/search/search";

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "dn-search-"));
  writeFileSync(path.join(root, "inbox.md"), "# inbox\nbuy milk\n");
  writeFileSync(path.join(root, "todo.md"), "# todo\nbuy bread\n");
  mkdirSync(path.join(root, "node_modules"), { recursive: true });
  writeFileSync(path.join(root, "node_modules", "vendored.md"), "buy milk vendored\n");
  writeFileSync(path.join(root, "image.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("search", () => {
  it("finds filenames", async () => {
    const matches = await searchWorkspace(root, { query: "inbox", includeFilenames: true, includeContent: false, maxResults: 100 });
    expect(matches.some((m) => m.relativePath === "inbox.md")).toBe(true);
  });

  it("finds literal content, skips excluded dirs and binaries", async () => {
    const matches = await searchWorkspace(root, { query: "buy", includeFilenames: false, includeContent: true, maxResults: 100 });
    const paths = matches.map((m) => m.relativePath);
    expect(paths).toContain("inbox.md");
    expect(paths).toContain("todo.md");
    expect(paths.some((p) => p.includes("node_modules"))).toBe(false);
    expect(paths).not.toContain("image.png");
  });

  it("respects maxResults and cancellation", async () => {
    const limited = await searchWorkspace(root, { query: "buy", includeFilenames: false, includeContent: true, maxResults: 1 });
    expect(limited).toHaveLength(1);
    const controller = new AbortController();
    controller.abort();
    const cancelled = await searchWorkspace(root, { query: "buy", includeFilenames: true, includeContent: true, maxResults: 100, signal: controller.signal });
    expect(cancelled.length).toBeLessThanOrEqual(1);
  });
});
