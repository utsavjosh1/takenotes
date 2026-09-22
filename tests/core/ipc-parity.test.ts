/**
 * IPC parity (ADR-0014 Gate A).
 *
 * Proves the thin IPC path preserves the existing renderer contract:
 * same args, same `FileReadResult` shape, same `AppError` codes.
 * Uses the production `NoteService + WorkspaceService + NativeFileAdapter`
 * against a tempdir — no Electron needed. Real `ipcMain.handle` wiring
 * stays transport-only in `src/main/ipc/register.ts`.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorkspaceRegistry } from "../../src/main/workspace/registry.js";
import { NativeFileAdapter } from "../../src/main/workspace/file-adapter.js";
import { NoteService } from "../../src/main/services/note-service.js";
import { WorkspaceService } from "../../src/main/services/workspace-service.js";

function makeNotes(): { workspaces: WorkspaceService; notes: NoteService } {
  const workspaces = new WorkspaceService(new WorkspaceRegistry());
  const notes = new NoteService(workspaces, {
    native: new NativeFileAdapter(async () => undefined),
    wslRequest: async () => {
      throw { code: "DISCONNECTED", message: "no helper in test" };
    },
    hasWslSession: () => false,
  });
  return { workspaces, notes };
}

describe("IPC parity: NoteService preserves renderer contract", () => {
  it("successful read returns FileReadResult shape", async () => {
    const root = mkdtempSync(join(tmpdir(), "takenotes-ipc-"));
    try {
      const { workspaces, notes } = makeNotes();
      const reg = workspaces.registerLocal("Notes", root, "linux-local");
      writeFileSync(join(root, "a.md"), "hello\n");
      const out = await notes.readFile(reg.id, "a.md");
      expect("result" in out).toBe(true);
      if ("result" in out) {
        // IpcResult<FileReadResult> shape: content + revision + newline + BOM.
        expect(typeof out.result.content).toBe("string");
        expect(out.result.revision.hash).toMatch(/^[a-f0-9]{64}$/);
        expect(typeof out.result.revision.size).toBe("number");
        expect(["lf", "crlf"]).toContain(out.result.newlineStyle);
        expect(typeof out.result.hadBom).toBe("boolean");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("missing file -> NOT_FOUND (not generic failure)", async () => {
    const root = mkdtempSync(join(tmpdir(), "takenotes-ipc-"));
    try {
      const { workspaces, notes } = makeNotes();
      const reg = workspaces.registerLocal("Notes", root, "linux-local");
      const out = await notes.readFile(reg.id, "nope.md");
      expect(out).toMatchObject({ error: { code: "NOT_FOUND" } });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("traversal -> INVALID_PATH/OUTSIDE_ROOT", async () => {
    const root = mkdtempSync(join(tmpdir(), "takenotes-ipc-"));
    try {
      const { workspaces, notes } = makeNotes();
      const reg = workspaces.registerLocal("Notes", root, "linux-local");
      const out = await notes.readFile(reg.id, "../secret.md");
      expect("error" in out).toBe(true);
      if ("error" in out) expect(["INVALID_PATH", "OUTSIDE_ROOT"]).toContain(out.error.code);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("stale write -> CONFLICT with same semantics as Core", async () => {
    const root = mkdtempSync(join(tmpdir(), "takenotes-ipc-"));
    try {
      const { workspaces, notes } = makeNotes();
      const reg = workspaces.registerLocal("Notes", root, "linux-local");
      writeFileSync(join(root, "c.md"), "v1\n");
      const read = await notes.readFile(reg.id, "c.md");
      expect("result" in read).toBe(true);
      if (!("result" in read)) return;
      writeFileSync(join(root, "c.md"), "v2-external\n");
      const out = await notes.writeFile(reg.id, "c.md", "v3-stale\n", read.result.revision.hash, read.result.newlineStyle, read.result.hadBom);
      expect(out).toMatchObject({ error: { code: "CONFLICT" } });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("unknown workspace -> INVALID_REQUEST", async () => {
    const root = mkdtempSync(join(tmpdir(), "takenotes-ipc-"));
    try {
      const { notes } = makeNotes();
      const out = await notes.readFile("00000000-0000-0000-0000-000000000000", "a.md");
      expect(out).toMatchObject({ error: { code: "INVALID_REQUEST" } });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
