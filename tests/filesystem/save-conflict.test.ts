import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkspaceRegistry } from "../../src/main/workspace/registry";
import { NativeFileAdapter } from "../../src/main/workspace/file-adapter";
import { NoteService } from "../../src/main/services/note-service";
import { WorkspaceService } from "../../src/main/services/workspace-service";

/** P1-05 acceptance 1+2 through the production desktop seam
 * (`NoteService` + `NativeFileAdapter`, POSIX kind so it runs anywhere —
 * same code path as `windows-local`, which differs only in the path
 * module; NTFS specifics stay Windows-gated). */
describe("desktop save/conflict loop (P1-05)", () => {
  let root: string;
  let notes: NoteService;
  let workspaceId: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "dn-save-"));
    const workspaces = new WorkspaceService(new WorkspaceRegistry());
    notes = new NoteService(workspaces, {
      native: new NativeFileAdapter(async () => undefined),
      wslRequest: async () => {
        throw { code: "DISCONNECTED", message: "no helper in test" };
      },
      hasWslSession: () => false,
    });
    workspaceId = workspaces.registerLocal("Notes", root, "linux-local").id;
  });

  afterEach(() => {
    try {
      chmodSync(root, 0o755);
    } catch {
      /* best effort */
    }
    rmSync(root, { recursive: true, force: true });
  });

  function diskBytes(rel: string): Buffer {
    return readFileSync(path.join(root, rel));
  }

  function tmpLitter(): string[] {
    return readdirSync(root).filter((n) => n.includes(".tmp-"));
  }

  it("read generates a revision; matching save succeeds with a new revision", async () => {
    writeFileSync(path.join(root, "a.md"), "v1\n");
    const read = await notes.readFile(workspaceId, "a.md");
    expect("result" in read).toBe(true);
    if (!("result" in read)) return;
    expect(read.result.revision.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(typeof read.result.revision.size).toBe("number");
    expect(typeof read.result.revision.mtimeMs).toBe("number");

    const saved = await notes.writeFile(workspaceId, "a.md", "v2\n", read.result.revision.hash, "lf", false);
    expect("revision" in saved).toBe(true);
    if (!("revision" in saved)) return;
    expect(saved.revision.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(saved.revision.hash).not.toBe(read.result.revision.hash);
    expect(diskBytes("a.md").toString("utf8")).toBe("v2\n");
    expect(tmpLitter()).toEqual([]);
  });

  it("sequential saves chain revisions; the stale first revision then conflicts", async () => {
    writeFileSync(path.join(root, "chain.md"), "v1\n");
    const r1 = await notes.readFile(workspaceId, "chain.md");
    if (!("result" in r1)) return;
    const s1 = await notes.writeFile(workspaceId, "chain.md", "v2\n", r1.result.revision.hash, "lf", false);
    expect("revision" in s1).toBe(true);
    if (!("revision" in s1)) return;
    // Save #2 uses the NEW baseline, not the stale A.
    const s2 = await notes.writeFile(workspaceId, "chain.md", "v3\n", s1.revision.hash, "lf", false);
    expect("revision" in s2).toBe(true);
    expect(diskBytes("chain.md").toString("utf8")).toBe("v3\n");
    // The original A is now stale.
    const stale = await notes.writeFile(workspaceId, "chain.md", "v-stale\n", r1.result.revision.hash, "lf", false);
    expect(stale).toMatchObject({ error: { code: "CONFLICT" } });
    expect(diskBytes("chain.md").toString("utf8")).toBe("v3\n");
  });

  it("two-actor loop: external modification → stale save CONFLICTs, disk bytes untouched", async () => {
    writeFileSync(path.join(root, "shared.md"), "A\n");
    const read = await notes.readFile(workspaceId, "shared.md");
    if (!("result" in read)) return;
    // Second actor: an external editor writes B directly.
    writeFileSync(path.join(root, "shared.md"), "B-external\n");
    const out = await notes.writeFile(workspaceId, "shared.md", "mine\n", read.result.revision.hash, "lf", false);
    expect(out).toMatchObject({ error: { code: "CONFLICT" } });
    // No corruption: the file is still exactly B, no tmp litter left behind.
    expect(diskBytes("shared.md")).toEqual(Buffer.from("B-external\n", "utf8"));
    expect(tmpLitter()).toEqual([]);
  });

  it("save maps missing/invalid/denied precisely", async () => {
    expect(await notes.writeFile(workspaceId, "ghost.md", "x", "0".repeat(64), "lf", false)).toMatchObject({
      error: { code: "NOT_FOUND" },
    });
    // `..` is OUTSIDE_ROOT per path policy; NUL is INVALID_PATH.
    expect(await notes.writeFile(workspaceId, "../escape.md", "x", "0".repeat(64), "lf", false)).toMatchObject({
      error: { code: "OUTSIDE_ROOT" },
    });
    expect(await notes.writeFile(workspaceId, "a\0b.md", "x", "0".repeat(64), "lf", false)).toMatchObject({
      error: { code: "INVALID_PATH" },
    });
    writeFileSync(path.join(root, "locked.md"), "keep\n");
    chmodSync(path.join(root, "locked.md"), 0o000);
    try {
      const read = await notes.readFile(workspaceId, "locked.md");
      expect(read).toMatchObject({ error: { code: "PERMISSION_DENIED" } });
    } finally {
      chmodSync(path.join(root, "locked.md"), 0o644);
    }
  });

  it("CRLF round-trip: style preserved byte-exact on save", async () => {
    writeFileSync(path.join(root, "crlf.md"), "a\r\nb\r\n");
    const read = await notes.readFile(workspaceId, "crlf.md");
    if (!("result" in read)) return;
    expect(read.result.newlineStyle).toBe("crlf");
    const saved = await notes.writeFile(workspaceId, "crlf.md", "a\nb\nc\n", read.result.revision.hash, "crlf", false);
    expect("revision" in saved).toBe(true);
    expect(diskBytes("crlf.md")).toEqual(Buffer.from("a\r\nb\r\nc\r\n", "utf8"));
  });

  it("BOM round-trip: BOM preserved byte-exact on save", async () => {
    const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("bom\n", "utf8")]);
    writeFileSync(path.join(root, "bom.md"), bom);
    const read = await notes.readFile(workspaceId, "bom.md");
    if (!("result" in read)) return;
    expect(read.result.hadBom).toBe(true);
    const saved = await notes.writeFile(
      workspaceId,
      "bom.md",
      "bom2\n",
      read.result.revision.hash,
      read.result.newlineStyle,
      true,
    );
    expect("revision" in saved).toBe(true);
    const bytes = diskBytes("bom.md");
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(bytes.subarray(3).toString("utf8")).toBe("bom2\n");
  });

  it("stale save leaves CRLF+BOM+content byte-identical (no-corruption rule)", async () => {
    const original = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("a\r\nb\r\n", "utf8")]);
    writeFileSync(path.join(root, "rich.md"), original);
    const read = await notes.readFile(workspaceId, "rich.md");
    if (!("result" in read)) return;
    const out = await notes.writeFile(workspaceId, "rich.md", "clobber\n", "0".repeat(64), "lf", false);
    expect(out).toMatchObject({ error: { code: "CONFLICT" } });
    expect(diskBytes("rich.md")).toEqual(original);
    expect(tmpLitter()).toEqual([]);
  });

  it("oversize content is refused before touching disk", async () => {
    writeFileSync(path.join(root, "big.md"), "small\n");
    const read = await notes.readFile(workspaceId, "big.md");
    if (!("result" in read)) return;
    const before = diskBytes("big.md");
    const out = await notes.writeFile(workspaceId, "big.md", "x".repeat(10 * 1024 * 1024 + 1), read.result.revision.hash, "lf", false);
    expect(out).toMatchObject({ error: { code: "TOO_LARGE" } });
    expect(diskBytes("big.md")).toEqual(before);
  });
});
