import { resolve } from "node:path";

/**
 * TN-DESIGN-001 verification harness — dev-only dataset toggle.
 *
 * The data boundary for the desktop app is the workspace folder on disk: the
 * app renders whatever folder is opened via File → Open workspace, so the
 * Demo / Worst-case toggle is a folder switch, not production code. Nothing
 * under `apps/` or `packages/` reads `TN_DATA`; the flag is consumed here in
 * test/support only (asserted by tests/design/worst-case-harness.test.ts).
 *
 *   Demo:  TN_DATA unset (or "demo")  → <repo>/demo-workspace/
 *   Worst: TN_DATA=worst              → <repo>/demo-workspace-worst/
 *          (seed with: node tools/scripts/seed-worst-case-workspace.mjs)
 */
export type DesignDataset = "demo" | "worst";

export const DEMO_WORKSPACE_DIR = "demo-workspace";
export const WORST_WORKSPACE_DIR = "demo-workspace-worst";

export function resolveDataset(env: NodeJS.ProcessEnv = process.env): DesignDataset {
  return env["TN_DATA"] === "worst" ? "worst" : "demo";
}

export function datasetRoot(dataset: DesignDataset, repoRoot: string = process.cwd()): string {
  return resolve(repoRoot, dataset === "worst" ? WORST_WORKSPACE_DIR : DEMO_WORKSPACE_DIR);
}

export function resolveDatasetRoot(env: NodeJS.ProcessEnv = process.env, repoRoot: string = process.cwd()): string {
  return datasetRoot(resolveDataset(env), repoRoot);
}

/** Manifest of the worst-case values TN-DESIGN-004+ verifications must cover. */
export const WORST_CASE_MANIFEST = {
  longDiacriticName: "Aleksandra Wiśniewska-Kowalczyk",
  unbreakableEmail: "bartholomew.fitzgerald@northwind-industries-holdings.example.com",
  shortNames: ["Jo", "J"],
  cjkTitle: "王秀英",
  counts: { one: 1, huge: 1284 },
  bulkFiles: 1000,
  expectedMissing: ["Notes/Does Not Exist.md", "Projects/Ghost.md", "attachments/gone.png", "Notes/Ghost.md"],
  collections: ["empty.yaml", "one.yaml", "huge.yaml"],
} as const;
