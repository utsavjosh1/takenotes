/**
 * Gate A landing proof (H-02).
 *
 * The production native note path (`NativeFileAdapter`, as wired into
 * `NoteService` for IPC) satisfies the SAME `CoreNoteService` behavioral
 * contract — not merely "Core tests itself". If the adapter ever drifts
 * from Core semantics (BOM, CRLF, CONFLICT, TOO_LARGE, error codes), this
 * suite fails.
 *
 * Directory/tree/rename/delete/trash operations intentionally stay on the
 * existing `local-workspace` helpers until their own slices migrate; this
 * suite covers the note read/update slice only (P1 Gate A scope).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "vitest";
import type { CoreWorkspace } from "../../src/core/services/note-service.js";
import { NativeFileAdapter } from "../../src/main/workspace/file-adapter.js";
import { defineNoteBehaviorSuite } from "./note-behavior-contract.js";

describe("production native note path satisfies the Core contract", () => {
  defineNoteBehaviorSuite("NativeFileAdapter (production IPC path)", () => {
    const root = mkdtempSync(join(tmpdir(), "takenotes-native-"));
    const adapter = new NativeFileAdapter(async () => undefined);
    const ws: CoreWorkspace = { root, kind: "linux-local" };
    const service = {
      read: (w: CoreWorkspace, relativePath: string) => adapter.read(w.root, w.kind, relativePath),
      update: (
        w: CoreWorkspace,
        relativePath: string,
        content: string,
        expectedHash: string,
        newlineStyle: "lf" | "crlf",
        hadBom: boolean,
      ) => adapter.write(w.root, w.kind, relativePath, content, expectedHash, newlineStyle, hadBom),
    };
    try {
      (globalThis as unknown as { __takenotesNativeRoots?: string[] }).__takenotesNativeRoots ??= [];
      (globalThis as unknown as { __takenotesNativeRoots: string[] }).__takenotesNativeRoots.push(root);
    } catch {
      /* ignore */
    }
    return { service, ws, root };
  });

  it("cleans native temp roots", () => {
    const roots = (globalThis as unknown as { __takenotesNativeRoots?: string[] }).__takenotesNativeRoots ?? [];
    for (const r of roots) {
      try {
        rmSync(r, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });
});
