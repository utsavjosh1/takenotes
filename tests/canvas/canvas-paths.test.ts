import { describe, expect, it } from "vitest";
import { emptyCanvas, isCanvasPath, parseCanvasDoc, serializeCanvasDoc } from "@takenotes/core/canvas/model";

/** Phase 4d Canvas wiring gate: path routing + seeded-doc contract. */

describe("canvas paths", () => {
  it("routes .canvas files to the canvas tab (case-insensitive)", () => {
    expect(isCanvasPath("board.canvas")).toBe(true);
    expect(isCanvasPath("Dir/Board.CANVAS")).toBe(true);
    expect(isCanvasPath("note.md")).toBe(false);
    expect(isCanvasPath("canvas.md")).toBe(false);
    expect(isCanvasPath("  board.canvas  ")).toBe(true);
  });

  it("the seeded empty canvas parses cleanly", () => {
    const seed = serializeCanvasDoc(emptyCanvas());
    const r = parseCanvasDoc(seed);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.doc).toEqual({ nodes: [], edges: [] });
      expect(r.errors).toEqual([]);
    }
  });
});
