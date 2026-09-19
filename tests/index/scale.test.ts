import { describe, expect, it } from "vitest";
import { WorkspaceIndex } from "../../src/shared/index/store";

/** P1-07 scale evidence: a few thousand files parse once into memory;
 * P1-08 queries then read memory, never disk. Bound is deliberately loose
 * (50x measured) — it guards against accidental quadratic blowups, not
 * for benchmarking CI machines. */
describe("index scale", () => {
  it("2000 rich files rebuild well within budget", () => {
    const idx = new WorkspaceIndex();
    const inputs = Array.from({ length: 2000 }, (_, i) => ({
      workspaceId: "ws",
      relativePath: `n${i}.md`,
      content: `---\ntitle: Note ${i}\ntags: [t${i % 50}, group/sub]\ndue: 2026-09-25\n---\n# Heading ${i}\n## Sub #tag${i % 10}\nText with [[Link${i % 100}|alias]] and [[Other#Head]].\n- [ ] Task ${i} @due(2026-09-25) @priority(high)\n- [x] Done ^a-${i}\n`,
      revision: { hash: `h${i}`, size: 300, mtimeMs: 1 },
    }));
    const t0 = performance.now();
    idx.rebuild("ws", inputs);
    const dt = performance.now() - t0;
    expect(idx.list("ws")).toHaveLength(2000);
    expect(dt).toBeLessThan(10_000);
  });
});
