import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkspaceRegistry } from "@takenotes/desktop/main/workspace/registry";
import { NativeFileAdapter } from "@takenotes/desktop/main/workspace/file-adapter";
import { NoteService } from "@takenotes/desktop/main/services/note-service";
import { WorkspaceService } from "@takenotes/desktop/main/services/workspace-service";

/** Step 4 attachment import through the production desktop seam
 * (`NoteService` + `NativeFileAdapter`, POSIX kind so it runs anywhere). */
describe("desktop attachment import (Step 4)", () => {
  let root: string;
  let notes: NoteService;
  let workspaceId: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "dn-import-"));
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
    rmSync(root, { recursive: true, force: true });
  });

  it("writes exact bytes, creating parents, with a content revision", async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
    const out = await notes.importBinary(workspaceId, "Notes/attachments/pic.png", bytes);
    if ("error" in out) throw new Error(`import failed: ${out.error.code}`);
    expect(out.revision.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(readFileSync(path.join(root, "Notes/attachments/pic.png"))).toEqual(bytes);
    expect(readdirSync(path.join(root, "Notes/attachments"))).toEqual(["pic.png"]);
  });

  it("never clobbers: a raced name fails ALREADY_EXISTS with bytes intact", async () => {
    const first = Buffer.from("first");
    const second = Buffer.from("second");
    const one = await notes.importBinary(workspaceId, "pic.png", first);
    if ("error" in one) throw new Error(`first import failed: ${one.error.code}`);
    const two = await notes.importBinary(workspaceId, "pic.png", second);
    if (!("error" in two) || two.error.code !== "ALREADY_EXISTS") throw new Error("expected ALREADY_EXISTS");
    expect(readFileSync(path.join(root, "pic.png"))).toEqual(first);
  });

  it("refuses escapes and oversize payloads with nothing written", async () => {
    const bad = await notes.importBinary(workspaceId, "../escape.png", Buffer.from("x"));
    if (!("error" in bad)) throw new Error("expected escape refusal");
    expect(readdirSync(root)).toEqual([]);
    const big = await notes.importBinary(workspaceId, "big.bin", Buffer.alloc(100 * 1024 * 1024 + 1));
    if (!("error" in big) || big.error.code !== "TOO_LARGE") throw new Error("expected TOO_LARGE");
    expect(readdirSync(root)).toEqual([]);
  });

  it("honestly refuses WSL workspaces (helper protocol is string-based)", async () => {
    const workspaces = new WorkspaceService(new WorkspaceRegistry());
    const wslNotes = new NoteService(workspaces, {
      native: new NativeFileAdapter(async () => undefined),
      wslRequest: async () => {
        throw new Error("must not reach the helper");
      },
      hasWslSession: () => false,
    });
    const wslId = workspaces.registerWsl("WSL", "/home/u/notes", "Ubuntu", "u").id;
    const out = await wslNotes.importBinary(wslId, "pic.png", Buffer.from("x"));
    if (!("error" in out) || out.error.code !== "INVALID_REQUEST") throw new Error("expected honest WSL refusal");
  });
});
