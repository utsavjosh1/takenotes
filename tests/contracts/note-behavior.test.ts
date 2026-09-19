/**
 * Shared note behavioral contract (ADR-0014 Gate A).
 *
 * Single source of truth for `note.read/update` semantics. Runs against
 * the Core seam (tempdir) and Gate B HTTP — same cases, same codes.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "vitest";
import { CoreNoteService, type CoreWorkspace } from "../../src/core/services/note-service.js";
import { LocalHostFilesystem } from "../../src/main/workspace/local-host-filesystem.js";
import { defineNoteBehaviorSuite } from "./note-behavior-contract.js";

function makeTempRoot(): string {
  return mkdtempSync(join(tmpdir(), "takenotes-core-"));
}

describe("core note behavior (local host, tempdir)", () => {
  defineNoteBehaviorSuite("CoreNoteService + LocalHostFilesystem", () => {
    const root = makeTempRoot();
    const service = new CoreNoteService(new LocalHostFilesystem());
    const ws: CoreWorkspace = { root, kind: "linux-local" };
    try {
      (globalThis as unknown as { __takenotesRoots?: string[] }).__takenotesRoots ??= [];
      (globalThis as unknown as { __takenotesRoots: string[] }).__takenotesRoots.push(root);
    } catch {
      /* ignore */
    }
    return { service, ws, root };
  });

  it("cleans temp roots", () => {
    const roots = (globalThis as unknown as { __takenotesRoots?: string[] }).__takenotesRoots ?? [];
    for (const r of roots) {
      try {
        rmSync(r, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });
});
