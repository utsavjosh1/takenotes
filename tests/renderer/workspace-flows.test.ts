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
  openWorkspaceFlow,
  refreshWorkspaceFlow,
  resolveWikilinkTarget,
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
