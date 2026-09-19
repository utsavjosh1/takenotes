import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CoreNoteService, CoreWorkspace } from "../../src/core/services/note-service.js";
import { MAX_FILE_BYTES } from "../../src/core/policy/note-policy.js";

type NoteBehaviorService = Pick<CoreNoteService, "read" | "update">;

export function defineNoteBehaviorSuite(
  name: string,
  makeService: () => { service: NoteBehaviorService; ws: CoreWorkspace; root: string } | Promise<{ service: NoteBehaviorService; ws: CoreWorkspace; root: string }>,
): void {
  describe(name, () => {
    it("reads a normal file with revision", async () => {
      const { service, ws } = await makeService();
      writeFileSync(join(ws.root, "hello.md"), "# hi\n");
      const out = await service.read(ws, "hello.md");
      expect("result" in out).toBe(true);
      if ("result" in out) {
        expect(out.result.content).toContain("hi");
        expect(out.result.revision.hash).toMatch(/^[a-f0-9]{64}$/);
        expect(["lf", "crlf"]).toContain(out.result.newlineStyle);
      }
    });

    it("updates with correct expectedRevision", async () => {
      const { service, ws } = await makeService();
      writeFileSync(join(ws.root, "note.md"), "v1\n");
      const read = await service.read(ws, "note.md");
      expect("result" in read).toBe(true);
      if (!("result" in read)) return;
      const out = await service.update(ws, "note.md", "v2\n", read.result.revision.hash, read.result.newlineStyle, read.result.hadBom);
      expect("revision" in out).toBe(true);
      const reread = await service.read(ws, "note.md");
      if ("result" in reread) expect(reread.result.content).toBe("v2\n");
    });

    it("returns NOT_FOUND for missing files", async () => {
      const { service, ws } = await makeService();
      const out = await service.read(ws, "missing.md");
      expect(out).toMatchObject({ error: { code: "NOT_FOUND" } });
    });

    it("rejects traversal and absolute paths with INVALID_PATH/OUTSIDE_ROOT", async () => {
      const { service, ws } = await makeService();
      for (const p of ["../secret.md", "a/../../x.md", "/etc/passwd", "..", "a\0b.md", "C:\\notes\\x.md", "\\\\server\\share\\x.md"] as const) {
        const out = await service.read(ws, p);
        expect("error" in out).toBe(true);
        if ("error" in out) {
          expect(["INVALID_PATH", "OUTSIDE_ROOT"]).toContain(out.error.code);
        }
      }
    });

    it("preserves BOM round-trip", async () => {
      const { service, ws } = await makeService();
      const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("bom\n", "utf8")]);
      writeFileSync(join(ws.root, "bom.md"), bom);
      const read = await service.read(ws, "bom.md");
      expect("result" in read).toBe(true);
      if (!("result" in read)) return;
      expect(read.result.hadBom).toBe(true);
      const out = await service.update(ws, "bom.md", "bom2\n", read.result.revision.hash, read.result.newlineStyle, true);
      expect("revision" in out).toBe(true);
      const reread = await service.read(ws, "bom.md");
      if ("result" in reread) {
        expect(reread.result.hadBom).toBe(true);
        expect(reread.result.content).toBe("bom2\n");
      }
    });

    it("preserves CRLF newlines", async () => {
      const { service, ws } = await makeService();
      writeFileSync(join(ws.root, "crlf.md"), "a\r\nb\r\n");
      const read = await service.read(ws, "crlf.md");
      expect("result" in read).toBe(true);
      if (!("result" in read)) return;
      expect(read.result.newlineStyle).toBe("crlf");
      const out = await service.update(ws, "crlf.md", "a\nb\nc\n", read.result.revision.hash, "crlf", read.result.hadBom);
      expect("revision" in out).toBe(true);
      const reread = await service.read(ws, "crlf.md");
      if ("result" in reread) expect(reread.result.content).toContain("\r\n");
    });

    it("returns CONFLICT on stale expectedRevision and leaves disk bytes unchanged", async () => {
      const { service, ws } = await makeService();
      writeFileSync(join(ws.root, "conflict.md"), "v1\n");
      const read = await service.read(ws, "conflict.md");
      if (!("result" in read)) return;
      writeFileSync(join(ws.root, "conflict.md"), "v2-external\n");
      const out = await service.update(ws, "conflict.md", "v3-stale\n", read.result.revision.hash, read.result.newlineStyle, read.result.hadBom);
      expect(out).toMatchObject({ error: { code: "CONFLICT" } });
      expect(readFileSync(join(ws.root, "conflict.md"), "utf8")).toBe("v2-external\n");
    });

    it("successful save returns a new revision", async () => {
      const { service, ws } = await makeService();
      writeFileSync(join(ws.root, "rev.md"), "v1\n");
      const read = await service.read(ws, "rev.md");
      if (!("result" in read)) return;
      const out = await service.update(ws, "rev.md", "v2\n", read.result.revision.hash, read.result.newlineStyle, read.result.hadBom);
      expect("revision" in out).toBe(true);
      if (!("revision" in out)) return;
      expect(out.revision.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(out.revision.hash).not.toBe(read.result.revision.hash);
      const reread = await service.read(ws, "rev.md");
      if ("result" in reread) expect(reread.result.revision.hash).toBe(out.revision.hash);
    });

    it("returns TOO_LARGE for oversized files on read and update", async () => {
      const { service, ws } = await makeService();
      writeFileSync(join(ws.root, "big.md"), Buffer.alloc(MAX_FILE_BYTES + 1, "a"));
      expect(await service.read(ws, "big.md")).toMatchObject({ error: { code: "TOO_LARGE" } });
      writeFileSync(join(ws.root, "small.md"), "small\n");
      const read = await service.read(ws, "small.md");
      if (!("result" in read)) return;
      const out = await service.update(ws, "small.md", "x".repeat(MAX_FILE_BYTES + 1), read.result.revision.hash, "lf", false);
      expect(out).toMatchObject({ error: { code: "TOO_LARGE" } });
      expect(readFileSync(join(ws.root, "small.md"), "utf8")).toBe("small\n");
    });

    it("returns UNSUPPORTED_ENCODING for non-UTF-8 bytes", async () => {
      const { service, ws } = await makeService();
      writeFileSync(join(ws.root, "binary.md"), Buffer.from([0xff, 0xfe, 0x00, 0x41]));
      expect(await service.read(ws, "binary.md")).toMatchObject({ error: { code: "UNSUPPORTED_ENCODING" } });
    });

    it("does not corrupt content on failed write", async () => {
      const { service, ws } = await makeService();
      writeFileSync(join(ws.root, "safe.md"), "original\n");
      const out = await service.update(ws, "safe.md", "new\n", "0".repeat(64), "lf", false);
      expect(out).toMatchObject({ error: { code: "CONFLICT" } });
      const reread = await service.read(ws, "safe.md");
      if ("result" in reread) expect(reread.result.content).toBe("original\n");
    });

    it("reads nested paths", async () => {
      const { service, ws } = await makeService();
      mkdirSync(join(ws.root, "Daily"), { recursive: true });
      writeFileSync(join(ws.root, "Daily", "2026-09-19.md"), "daily\n");
      const out = await service.read(ws, "Daily/2026-09-19.md");
      expect("result" in out).toBe(true);
    });
  });
}
