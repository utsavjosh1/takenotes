import { describe, expect, it } from "vitest";
import type { DirectoryEntry, FileReadResult, IpcResult } from "../../src/shared/contracts/ipc";
import { WorkspaceIndex } from "../../src/shared/index/store";
import { buildWorkspaceIndex, type IndexApi } from "../../src/renderer/index/workspace-index";

const WS = { workspaceId: "ws", displayName: "N", type: "windows-local", connection: "connected" } as const;

function ok<T>(result: T): IpcResult<T> {
  return { ok: true, result };
}

/** P1-08 precondition: the bulk build must not SILENTLY omit eligible
 * files. Junk dirs are excluded (mirroring the old scan); hitting the
 * safety bound reports `truncated` instead of dropping quietly. */
describe("index build coverage honesty", () => {
  function api(relPaths: string[]): IndexApi {
    return {
      directory: {
        list: async (_wid, dir) => {
          const dirs = new Set<string>();
          const files: DirectoryEntry[] = [];
          for (const rel of relPaths) {
            const slash = rel.lastIndexOf("/");
            const parent = slash < 0 ? "" : rel.slice(0, slash);
            if (parent === dir) {
              files.push({ name: rel.slice(slash + 1), relativePath: rel, kind: "file", fileClass: "markdown", size: 10, mtimeMs: 1 });
            } else if (parent.startsWith(dir ? `${dir}/` : "") && parent !== dir) {
              const rest = dir ? parent.slice(dir.length + 1) : parent;
              dirs.add(rest.split("/")[0]!);
            }
          }
          const dirEntries: DirectoryEntry[] = [...dirs].map((d) => ({
            name: d,
            relativePath: dir ? `${dir}/${d}` : d,
            kind: "directory",
            fileClass: "other",
            size: 0,
            mtimeMs: 1,
          }));
          return ok([...dirEntries, ...files]);
        },
      },
      file: {
        read: async (_w, rel) =>
          ok({ content: `# ${rel}\n`, revision: { hash: "h", size: 10, mtimeMs: 1 }, newlineStyle: "lf", hadBom: false } as FileReadResult),
      },
    };
  }

  it("excludes junk dirs, indexes the rest", async () => {
    const store = new WorkspaceIndex();
    const res = await buildWorkspaceIndex(api(["a.md", "node_modules/v.md", ".git/g.md", "dist/d.md"]), store, { ...WS });
    expect(res).toMatchObject({ ok: true, truncated: false });
    expect(store.list("ws").map((e) => e.relativePath)).toEqual(["a.md"]);
  });

  it("reports truncation instead of silently dropping", async () => {
    const store = new WorkspaceIndex();
    const rels = Array.from({ length: 2001 }, (_, i) => `n${i}.md`);
    const res = await buildWorkspaceIndex(api(rels), store, { ...WS });
    expect(res).toMatchObject({ ok: true, truncated: true });
    expect(store.list("ws")).toHaveLength(2000);
  });
});