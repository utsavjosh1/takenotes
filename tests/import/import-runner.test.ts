import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { planImport } from "@takenotes/core/import/plan";
import { NoteService } from "@takenotes/desktop/main/services/note-service";
import { WorkspaceService } from "@takenotes/desktop/main/services/workspace-service";
import { NativeFileAdapter } from "@takenotes/desktop/main/workspace/file-adapter";
import { cachePlanForTest, createImportRunner } from "@takenotes/desktop/main/import/runner";

function services(root: string) {
  const workspaces = new WorkspaceService();
  const notes = new NoteService(workspaces, {
    native: new NativeFileAdapter(async () => {}),
    wslRequest: async () => {
      throw new Error("no wsl in tests");
    },
  });
  const reg = workspaces.registerLocal("Notes", root, "linux-local");
  return { workspaces, notes, workspaceId: reg.id };
}

describe("import runner (confirm path)", () => {
  it("writes notes + attachments through services, errors continue", async () => {
    const wsRoot = mkdtempSync(join(tmpdir(), "takenotes-importws-"));
    const bundleRoot = mkdtempSync(join(tmpdir(), "takenotes-importbundle-"));
    try {
      mkdirSync(join(bundleRoot, "img"));
      writeFileSync(join(bundleRoot, "img", "pic.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      const { workspaces, notes, workspaceId } = services(wsRoot);
      const runner = createImportRunner({ workspaces, notes });
      const plan = planImport(
        [
          { rel: "a.md", kind: "markdown", text: "# A\n![p](img/pic.png)" },
          { rel: "img/pic.png", kind: "asset" },
        ],
        { attachmentLocation: "root", attachmentFolder: "", existingLower: new Set() },
      );
      const absByRel = new Map([
        ["a.md", join(bundleRoot, "a.md")],
        ["img/pic.png", join(bundleRoot, "img", "pic.png")],
      ]);
      const token = cachePlanForTest(plan, absByRel);
      const out = await runner.confirmImport(workspaceId, token);
      if (!("summary" in out)) expect.unreachable();
      expect(out.summary).toMatchObject({ notes: 1, attachments: 1, errors: [] });
      const read = await notes.readFile(workspaceId, "a.md");
      if (!("result" in read)) expect.unreachable();
      else expect(read.result.content).toContain("![p](pic.png)");

      // Single-use: the same token is spent.
      const again = await runner.confirmImport(workspaceId, token);
      expect("error" in again).toBe(true);

      // Unknown workspace fails honestly.
      const token2 = cachePlanForTest(plan, absByRel);
      const lost = await runner.confirmImport("deadbeef-dead-beef-dead-beefdeadbeef", token2);
      expect("error" in lost).toBe(true);
    } finally {
      rmSync(wsRoot, { recursive: true, force: true });
      rmSync(bundleRoot, { recursive: true, force: true });
    }
  });
});
