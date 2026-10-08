/**
 * Workspace lifecycle flows (review slice C1 + H5 + M4) — logic tests.
 *
 * Seam under test: `apps/desktop/src/renderer/workspace-flows.ts`, the pure
 * open/close/refresh choreography that `App.tsx` delegates to. No React
 * renderer, no DOM, no bridge: dependencies are recording fakes backed by a
 * fixture filesystem, so assertions cover call order, explicit-workspace
 * identity, teardown completeness, and tree/index convergence (I-TREE-4).
 *
 * Invariants exercised: I-WS-3 (no cross-workspace state leak),
 * I-TREE-4 (tree and index converge on the open workspace).
 */
import { describe, expect, it } from "vitest";
import type { WorkspaceInfo } from "@takenotes/contracts/ipc";
import {
  closeWorkspaceFlow,
  followUnresolvedLinkFlow,
  linkMentionFlow,
  openWorkspaceFlow,
  refreshWorkspaceFlow,
  resolveWikilinkTarget,
  type FollowLinkDeps,
  type LinkMentionDeps,
  type WorkspaceFlowDeps,
} from "@takenotes/desktop/renderer/workspace-flows";

/* ---------------- fakes ---------------- */

const FIXTURES: Record<string, string[]> = {
  "ws-a": ["a.md", "docs/d.md"],
  "ws-b": ["b.md"],
};

function ws(id: string, name: string): WorkspaceInfo {
  return { workspaceId: id, displayName: name, type: "linux-local", connection: "connected" };
}

type FakeWorld = {
  deps: WorkspaceFlowDeps;
  /** Ordered call log: "docs.reset" | "tree.resetTree" | "tree.refresh:ws-a" | … */
  calls: string[];
  recordedWorkspaces: [string, string][];
  treeFiles: Set<string>;
  indexFiles: Set<string>;
};

function makeWorld(): FakeWorld {
  const world = {} as FakeWorld;
  world.calls = [];
  world.recordedWorkspaces = [];
  world.treeFiles = new Set();
  world.indexFiles = new Set();
  world.deps = {
    docs: {
      reset: () => void world.calls.push("docs.reset"),
    },
    tree: {
      resetTree: () => {
        world.calls.push("tree.resetTree");
        world.treeFiles.clear();
      },
      refresh: async (target: WorkspaceInfo) => {
        world.calls.push(`tree.refresh:${target.workspaceId}`);
        world.treeFiles = new Set(FIXTURES[target.workspaceId] ?? []);
      },
      rebuild: async (target: WorkspaceInfo) => {
        world.calls.push(`tree.rebuild:${target.workspaceId}`);
      },
    },
    search: {
      resetSearch: () => {
        world.calls.push("search.resetSearch");
        world.indexFiles.clear();
      },
      refreshIndex: async (target: WorkspaceInfo) => {
        world.calls.push(`search.refreshIndex:${target.workspaceId}`);
        world.indexFiles = new Set(FIXTURES[target.workspaceId] ?? []);
      },
    },
    recordWorkspace: (name: string, kind: string) => void world.recordedWorkspaces.push([name, kind]),
  };
  return world;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/* ---------------- Test A (C1): open acts on the explicit workspace ---------------- */

describe("C1 — open loads the just-opened workspace [I-WS-3]", () => {
  it("open resets previous state, then loads tree + index for the explicit workspace", async () => {
    const world = makeWorld();
    const wsA = ws("ws-a", "A");

    await openWorkspaceFlow(world.deps, wsA);
    await flush(); // background index build is unawaited by design

    // Every load carries the explicit workspace identity — never ambient state.
    expect(world.calls).toContain("tree.refresh:ws-a");
    expect(world.calls).toContain("tree.rebuild:ws-a");
    expect(world.calls).toContain("search.refreshIndex:ws-a");
    expect(world.calls).not.toContain("tree.refresh:ws-b");
    // Teardown precedes every load: stale state can never survive an open.
    expect(world.calls.indexOf("docs.reset")).toBeLessThan(world.calls.indexOf("tree.refresh:ws-a"));
    expect(world.calls.indexOf("tree.resetTree")).toBeLessThan(world.calls.indexOf("tree.refresh:ws-a"));
    expect(world.calls.indexOf("search.resetSearch")).toBeLessThan(
      world.calls.indexOf("search.refreshIndex:ws-a"),
    );
    expect(world.recordedWorkspaces).toEqual([["A", "linux-local"]]);
    // Tree and index converge on the same file set (I-TREE-4).
    expect(world.treeFiles).toEqual(new Set(["a.md", "docs/d.md"]));
    expect(world.indexFiles).toEqual(world.treeFiles);
  });
});

/* ---------------- Test B (C1+H5): switch never leaks ---------------- */

describe("H5 — workspace switch leaves no previous-workspace state [I-WS-3]", () => {
  it("opening B after A shows only B: teardown runs between the two loads", async () => {
    const world = makeWorld();
    await openWorkspaceFlow(world.deps, ws("ws-a", "A"));
    await flush();
    expect(world.treeFiles.has("a.md")).toBe(true);
    world.calls.length = 0;

    await openWorkspaceFlow(world.deps, ws("ws-b", "B"));
    await flush();

    // B's loads ran, A's files are gone from both tree and index.
    expect(world.calls).toContain("tree.refresh:ws-b");
    expect(world.treeFiles).toEqual(new Set(["b.md"]));
    expect(world.indexFiles).toEqual(new Set(["b.md"]));
    // The second open's teardown cleared A's state before B's loads committed:
    // every reset for open(B) precedes B's first load.
    const resetIdx = Math.max(
      world.calls.lastIndexOf("docs.reset"),
      world.calls.lastIndexOf("tree.resetTree"),
      world.calls.lastIndexOf("search.resetSearch"),
    );
    expect(resetIdx).toBeGreaterThanOrEqual(0);
    expect(resetIdx).toBeLessThan(world.calls.indexOf("tree.refresh:ws-b"));
  });
});

/* ---------------- Test C (H5): close resets ---------------- */

describe("H5 — close resets workspace-scoped state [I-WS-3]", () => {
  it("close resets documents, tree, and search, and clears both file sets", async () => {
    const world = makeWorld();
    await openWorkspaceFlow(world.deps, ws("ws-a", "A"));
    await flush();
    world.calls.length = 0;

    closeWorkspaceFlow(world.deps);

    expect(world.calls).toEqual(["docs.reset", "tree.resetTree", "search.resetSearch"]);
    expect(world.treeFiles.size).toBe(0);
    expect(world.indexFiles.size).toBe(0);
  });
});

/* ---------------- Test D (M4): one logical refresh ---------------- */

describe("M4 — refresh always covers tree + enumeration + index", () => {
  it("refresh loads tree root, rebuilds enumeration, and rebuilds the index for the same workspace", async () => {
    const world = makeWorld();
    const wsA = ws("ws-a", "A");

    await refreshWorkspaceFlow(world.deps, wsA);
    await flush();

    expect(world.calls).toEqual([
      "tree.refresh:ws-a",
      "tree.rebuild:ws-a",
      "search.refreshIndex:ws-a",
    ]);
    expect(world.treeFiles).toEqual(world.indexFiles);
  });

  it("refresh with no workspace is a no-op (all entry points guard the same way)", async () => {
    const world = makeWorld();

    await refreshWorkspaceFlow(world.deps, null);
    await flush();

    expect(world.calls).toEqual([]);
  });
});

describe("resolveWikilinkTarget (Step 1 reading-view follow-links)", () => {
  const FILES = ["Old.md", "Ref.md", "Other/Old.md", "Projects/Plan.md", "notes/Plan.md", "image.png"];

  it("resolves exact and extension-implied names", () => {
    expect(resolveWikilinkTarget("Ref", FILES)).toBe("Ref.md");
    expect(resolveWikilinkTarget("Ref.md", FILES)).toBe("Ref.md");
    expect(resolveWikilinkTarget("ref", FILES)).toBe("Ref.md");
  });

  it("refuses to guess ambiguous bare names (link-rename parity)", () => {
    expect(resolveWikilinkTarget("Old", FILES)).toBeNull();
    expect(resolveWikilinkTarget("Old.md", FILES)).toBeNull();
    expect(resolveWikilinkTarget("Plan", FILES)).toBeNull();
  });

  it("resolves unique path-qualified targets by suffix", () => {
    expect(resolveWikilinkTarget("Other/Old", FILES)).toBe("Other/Old.md");
    expect(resolveWikilinkTarget("projects/plan.md", FILES)).toBe("Projects/Plan.md");
    expect(resolveWikilinkTarget("Nope/Plan", FILES)).toBeNull();
  });

  it("strips fragments and rejects non-notes", () => {
    expect(resolveWikilinkTarget("Ref#Heading", FILES)).toBe("Ref.md");
    expect(resolveWikilinkTarget("Ref#^abc123", FILES)).toBe("Ref.md");
    expect(resolveWikilinkTarget("image", FILES)).toBeNull();
    expect(resolveWikilinkTarget("", FILES)).toBeNull();
    expect(resolveWikilinkTarget("Ref", [])).toBeNull();
  });
});

describe("followUnresolvedLinkFlow (Step 4 follow-to-create)", () => {
  type World = {
    deps: FollowLinkDeps;
    calls: string[];
    files: string[];
    failCreate: Set<string>;
    failWrite: Set<string>;
  };

  function makeWorld(files: string[]): World {
    const world = {} as World;
    world.calls = [];
    world.files = [...files];
    world.failCreate = new Set();
    world.failWrite = new Set();
    const rev = (hash: string) => ({ hash, size: 0, mtimeMs: 1 });
    world.deps = {
      listFiles: () => [...world.files],
      createFile: async (rel: string) => {
        world.calls.push(`create:${rel}`);
        if (world.failCreate.has(rel)) return { ok: false, error: { code: "PERMISSION_DENIED", message: "denied" } };
        if (world.files.includes(rel)) return { ok: false, error: { code: "ALREADY_EXISTS", message: "exists" } };
        world.files.push(rel);
        return { ok: true, result: rev("h-create") };
      },
      writeFile: async (rel: string, content: string, expectedHash: string) => {
        world.calls.push(`write:${rel}:${content.length}:${expectedHash}`);
        if (world.failWrite.has(rel)) return { ok: false, error: { code: "CONFLICT", message: "changed" } };
        return { ok: true, result: rev("h-write") };
      },
      upsertIndex: (rel: string) => void world.calls.push(`upsert:${rel}`),
      openFile: async (rel: string) => void world.calls.push(`open:${rel}`),
      reveal: (rel: string) => void world.calls.push(`reveal:${rel}`),
      refresh: async () => void world.calls.push("refresh"),
    };
    return world;
  }

  it("creates beside the source note, then opens + reveals after refresh", async () => {
    const world = makeWorld(["projects/Other.md"]);
    const res = await followUnresolvedLinkFlow(world.deps, "Note", "projects/Other.md");
    expect(res).toEqual({ status: "created", rel: "projects/Note.md" });
    expect(world.calls).toEqual([
      "create:projects/Note.md",
      "write:projects/Note.md:0:h-create",
      "upsert:projects/Note.md",
      "refresh",
      "open:projects/Note.md",
      "reveal:projects/Note.md",
    ]);
  });

  it("opens instead of duplicating when the note appeared since (race)", async () => {
    const world = makeWorld(["Note.md"]);
    const res = await followUnresolvedLinkFlow(world.deps, "Note", "hub.md");
    expect(res).toEqual({ status: "opened-existing", rel: "Note.md" });
    expect(world.calls).toEqual(["open:Note.md", "reveal:Note.md"]);
  });

  it("re-resolves on ALREADY_EXISTS instead of failing", async () => {
    const world = makeWorld(["hub.md"]);
    // A concurrent creator lands between our listing and our create.
    let n = 0;
    const base = world.deps.listFiles;
    world.deps.listFiles = () => (++n === 1 ? base() : [...base(), "Race.md"]);
    world.deps.createFile = async (rel: string) => {
      world.calls.push(`create:${rel}`);
      return { ok: false, error: { code: "ALREADY_EXISTS", message: "exists" } };
    };
    const res = await followUnresolvedLinkFlow(world.deps, "Race", "hub.md");
    expect(res).toEqual({ status: "opened-existing", rel: "Race.md" });
    expect(world.calls).toEqual(["create:Race.md", "open:Race.md", "reveal:Race.md"]);
  });

  it("reports invalid targets without touching the filesystem", async () => {
    const world = makeWorld(["hub.md"]);
    expect(await followUnresolvedLinkFlow(world.deps, "../Escape", "a/b.md")).toEqual({ status: "invalid" });
    expect(await followUnresolvedLinkFlow(world.deps, "pic.png", "hub.md")).toEqual({ status: "invalid" });
    expect(world.calls).toEqual([]);
  });

  it("reports failed when create or write is rejected", async () => {
    const denied = makeWorld(["hub.md"]);
    denied.failCreate.add("Nope.md");
    expect(await followUnresolvedLinkFlow(denied.deps, "Nope", "hub.md")).toEqual({ status: "failed", rel: "Nope.md" });
    expect(denied.calls).toEqual(["create:Nope.md"]);

    const conflict = makeWorld(["hub.md"]);
    conflict.failWrite.add("Note.md");
    expect(await followUnresolvedLinkFlow(conflict.deps, "Note", "hub.md")).toEqual({ status: "failed", rel: "Note.md" });
    expect(conflict.calls).toEqual(["create:Note.md", "write:Note.md:0:h-create"]);
  });
});

describe("linkMentionFlow (Step 4 alias action)", () => {
  type World = {
    deps: LinkMentionDeps;
    calls: string[];
    files: Map<string, { content: string; hash: string }>;
    conflictOn: Set<string>;
  };

  function makeWorld(): World {
    const world = {} as World;
    world.calls = [];
    world.files = new Map([["essay.md", { content: "Canon and Cee agree.\n", hash: "h0" }]]);
    world.conflictOn = new Set();
    world.deps = {
      readFile: async (rel: string) => {
        world.calls.push(`read:${rel}`);
        const f = world.files.get(rel);
        if (!f) return { ok: false, error: { code: "NOT_FOUND", message: "missing" } };
        return { ok: true, result: { content: f.content, revision: { hash: f.hash, size: 1, mtimeMs: 1 }, newlineStyle: "lf", hadBom: false } };
      },
      writeFile: async ({ rel, content, expectedHash }) => {
        world.calls.push(`write:${rel}:${expectedHash}`);
        const f = world.files.get(rel);
        if (!f) return { ok: false, error: { code: "NOT_FOUND", message: "missing" } };
        if (world.conflictOn.has(rel)) return { ok: false, error: { code: "CONFLICT", message: "changed" } };
        if (f.hash !== expectedHash) return { ok: false, error: { code: "CONFLICT", message: "changed" } };
        world.files.set(rel, { content, hash: "h1" });
        return { ok: true, result: { hash: "h1", size: 1, mtimeMs: 2 } };
      },
      upsertIndex: (rel: string) => void world.calls.push(`upsert:${rel}`),
      reconcile: async (rel: string) => void world.calls.push(`reconcile:${rel}`),
      refresh: async () => void world.calls.push("refresh"),
      linkFormat: () => "shortest",
      useWikilinks: () => true,
    };
    return world;
  }

  it("converts the mention with a guarded write, then converges", async () => {
    const world = makeWorld();
    const res = await linkMentionFlow(world.deps, "essay.md", "Cee", "Canon.md");
    expect(res).toEqual({ status: "linked", rel: "essay.md", line: 1 });
    expect(world.files.get("essay.md")?.content).toBe("Canon and [[Canon|Cee]] agree.\n");
    expect(world.calls).toEqual(["read:essay.md", "write:essay.md:h0", "upsert:essay.md", "reconcile:essay.md", "refresh"]);
  });

  it("reports not-found when the mention vanished", async () => {
    const world = makeWorld();
    const res = await linkMentionFlow(world.deps, "essay.md", "Ghost", "Ghost.md");
    expect(res).toEqual({ status: "not-found", rel: "essay.md" });
    expect(world.calls).toEqual(["read:essay.md"]);
  });

  it("reports conflict on concurrent edits and failed on missing files", async () => {
    const world = makeWorld();
    world.conflictOn.add("essay.md");
    expect(await linkMentionFlow(world.deps, "essay.md", "Cee", "Canon.md")).toEqual({ status: "conflict", rel: "essay.md" });
    expect(await linkMentionFlow(world.deps, "gone.md", "Cee", "Canon.md")).toEqual({ status: "failed", rel: "gone.md" });
  });
});

describe("arrayBufferToBase64", () => {
  it("round-trips bytes incl. empty and high-bit content", async () => {
    const { arrayBufferToBase64 } = await import("@takenotes/desktop/renderer/workspace-flows");
    const bytes = new Uint8Array([0x89, 0x50, 0x00, 0xff, 0x7f]);
    const b64 = arrayBufferToBase64(bytes.buffer as ArrayBuffer);
    expect(Buffer.from(b64, "base64")).toEqual(Buffer.from(bytes));
    expect(arrayBufferToBase64(new ArrayBuffer(0))).toBe("");
    // Known vector.
    expect(arrayBufferToBase64(new TextEncoder().encode("hello").buffer as ArrayBuffer)).toBe("aGVsbG8=");
  });
});
