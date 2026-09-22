import { describe, expect, it } from "vitest";
import type { AppError } from "../../src/shared/errors";
import type { DirectoryEntry, FileReadResult, IpcResult } from "../../src/shared/contracts/ipc";
import { WorkspaceIndex } from "../../src/shared/index/store";
import { buildWorkspaceIndex, indexStatusMessage, type IndexApi } from "../../src/renderer/index/workspace-index";

const WS = { workspaceId: "ws", displayName: "N", type: "windows-local", connection: "connected" } as const;

function entry(rel: string, size = 10, fileClass: DirectoryEntry["fileClass"] = "markdown"): DirectoryEntry {
  return { name: rel, relativePath: rel, kind: "file", fileClass, size, mtimeMs: 1 };
}

function ok<T>(result: T): IpcResult<T> {
  return { ok: true, result };
}

function err(code: string): IpcResult<never> {
  return { ok: false, error: { code, message: code } as AppError };
}

/** P1-07 error isolation at the provider seam: one bad file never kills
 * the build; a dead workspace aborts honestly. */
describe("workspace index build", () => {
  function api(files: Record<string, string>, opts?: { readError?: (rel: string) => IpcResult<FileReadResult> | null; listError?: AppError | null }): IndexApi {
    return {
      directory: {
        list: async () =>
          opts?.listError ? { ok: false, error: opts.listError } : ok(Object.keys(files).map((r) => entry(r, files[r]!.length))),
      },
      file: {
        read: async (_wid, rel) => {
          const forced = opts?.readError?.(rel);
          if (forced) return forced;
          const content = files[rel];
          if (content === undefined) return err("NOT_FOUND");
          return ok({ content, revision: { hash: "h", size: content.length, mtimeMs: 1 }, newlineStyle: "lf", hadBom: false } as FileReadResult);
        },
      },
    };
  }

  it("indexes markdown/text, skips oversize without reading", async () => {
    const store = new WorkspaceIndex();
    let reads = 0;
    const a: IndexApi = {
      directory: { list: async () => ok([entry("a.md"), entry("big.md", 2 * 1024 * 1024), entry("img.png", 5, "image")]) },
      file: {
        read: async (_w, rel) => {
          reads += 1;
          return ok({ content: `# ${rel}\n`, revision: { hash: "h", size: 10, mtimeMs: 1 }, newlineStyle: "lf", hadBom: false } as FileReadResult);
        },
      },
    };
    const res = await buildWorkspaceIndex(a, store, { ...WS });
    expect(res).toMatchObject({ ok: true, indexed: 1, skipped: 1 });
    expect(reads).toBe(1);
    expect(store.get("ws", "a.md")?.headings[0]?.text).toBe("a.md");
  });

  it("vanished/unreadable files skip; DISCONNECTED aborts; list failure aborts", async () => {
    const gone = new WorkspaceIndex();
    const r1 = await buildWorkspaceIndex(
      api({ "a.md": "# A\n" }, { readError: (rel) => (rel === "a.md" ? err("NOT_FOUND") : null) }),
      gone,
      { ...WS },
    );
    expect(r1).toMatchObject({ ok: true, indexed: 0, skipped: 1 });

    const dead = new WorkspaceIndex();
    const r2 = await buildWorkspaceIndex(
      api({ "a.md": "# A\n" }, { readError: () => err("DISCONNECTED") }),
      dead,
      { ...WS },
    );
    expect(r2.ok).toBe(false);

    const listFail = new WorkspaceIndex();
    const r3 = await buildWorkspaceIndex(api({}, { listError: { code: "PERMISSION_DENIED", message: "no" } as AppError }), listFail, { ...WS });
    expect(r3).toMatchObject({ ok: false });
    expect(listFail.list("ws")).toEqual([]);
  });
});

/** H-04: any bound that can omit eligible notes must produce user-visible
 * warning data — never a silent partial index. */
describe("index completeness notice", () => {
  it("complete index produces no warning", () => {
    expect(indexStatusMessage({ indexed: 42, skipped: 0, truncated: false })).toBeNull();
  });

  it("truncated listing produces a partial-index warning", () => {
    const msg = indexStatusMessage({ indexed: 2000, skipped: 0, truncated: true });
    expect(msg).toContain("Partial index");
    expect(msg).toContain("2000");
  });

  it("skipped oversized files produce an incomplete-search indication", () => {
    const msg = indexStatusMessage({ indexed: 10, skipped: 3, truncated: false });
    expect(msg).toContain("incomplete");
    expect(msg).toContain("3");
  });

  it("truncated + skipped reports both bounds distinctly", () => {
    const msg = indexStatusMessage({ indexed: 2000, skipped: 2, truncated: true });
    expect(msg).toContain("Partial index");
    expect(msg).toContain("skipped");
  });
});
