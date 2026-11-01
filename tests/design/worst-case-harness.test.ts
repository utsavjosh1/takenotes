import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  WORST_CASE_MANIFEST,
  datasetRoot,
  resolveDataset,
  resolveDatasetRoot,
} from "../support/design-harness";

/**
 * TN-DESIGN-001 acceptance gate: the verification harness exists before any
 * visual-fix task may claim verification (audit F-035). This test proves:
 * (1) the worst-case generator covers the manifest; (2) the Demo/Worst toggle
 * selects datasets behind the dev-only TN_DATA flag; (3) the toggle lives
 * outside production code (no component, style, or copy changes).
 */
function seedWorst(root: string): string {
  const out = execFileSync(
    "node",
    [join("tools", "scripts", "seed-worst-case-workspace.mjs"), "--root", root],
    { encoding: "utf8" },
  );
  return out;
}

function rendererSource(...parts: string[]): string {
  return readFileSync(join(__dirname, "..", "..", "apps", "desktop", "src", "renderer", ...parts), "utf8");
}

describe("worst-case fixture coverage (F-035)", () => {
  const root = mkdtempSync(join(tmpdir(), "tn-worst-"));
  seedWorst(root);

  it("seeds the break-ui people + identifier probes", () => {
    expect(existsSync(join(root, "Notes", "Aleksandra Wiśniewska-Kowalczyk.md"))).toBe(true);
    expect(existsSync(join(root, "Notes", "Jo.md"))).toBe(true);
    expect(existsSync(join(root, "Notes", "J.md"))).toBe(true);
    expect(existsSync(join(root, "Notes", "王秀英.md"))).toBe(true);
    expect(existsSync(join(root, "Notes", "نور الهدى عبد الرحمن.md"))).toBe(true);
    expect(existsSync(join(root, "Notes", "🦊 Fox.md"))).toBe(true);
    const inbox = readFileSync(join(root, "Inbox.md"), "utf8");
    expect(inbox).toContain(WORST_CASE_MANIFEST.unbreakableEmail);
    const identifiers = readFileSync(join(root, "Notes", "Identifiers.md"), "utf8");
    expect(identifiers).toContain("first.last+billing-notifications@example.com");
    const tags = readFileSync(join(root, "Notes", "Tag wall.md"), "utf8");
    expect(tags).toContain("customer-feedback-from-enterprise-onboarding");
    expect(tags).toContain("Benachrichtigungseinstellungen");
    const escaping = readFileSync(join(root, "Notes", "Escaping probe.md"), "utf8");
    expect(escaping).toContain("<script>alert(1)</script>");
  });

  it("covers the 1 vs 1284 counts + empty/one/1000-row collections", () => {
    const one = readFileSync(join(root, "Tasks", "One overdue.md"), "utf8");
    expect(one).toContain("@due(");
    const huge = readFileSync(join(root, "Tasks", "Huge backlog.md"), "utf8").split("\n");
    const tasks = huge.filter((l) => l.startsWith("- [ ] "));
    expect(tasks).toHaveLength(WORST_CASE_MANIFEST.counts.huge);
    expect(statSync(join(root, "Empty")).isDirectory()).toBe(true);
    expect(readdirSync(join(root, "Empty"))).toHaveLength(0);
    expect(readdirSync(join(root, "Single"))).toHaveLength(1);
    expect(readdirSync(join(root, "Archive", "Bulk"))).toHaveLength(WORST_CASE_MANIFEST.bulkFiles);
    for (const name of WORST_CASE_MANIFEST.collections) {
      const yaml = readFileSync(join(root, ".takenotes", "collections", name), "utf8");
      expect(yaml).toMatch(/query: tag:/);
    }
  });

  it("plants missing targets for recovery/empty-state review", () => {
    const probe = readFileSync(join(root, "Notes/Broken links.md"), "utf8");
    expect(probe).toContain("Notes/Does Not Exist");
    expect(probe).toContain("attachments/gone.png");
    expect(existsSync(join(root, "attachments", "gone.png"))).toBe(false);
    const favorites = readFileSync(join(root, ".takenotes", "favorites.yaml"), "utf8");
    expect(favorites).toContain("Notes/Ghost.md");
    expect(existsSync(join(root, "Notes", "Ghost.md"))).toBe(false);
    // Controls must resolve: the fixture tests recovery, not a broken seed.
    expect(existsSync(join(root, "Notes", "Jo.md"))).toBe(true);
    expect(existsSync(join(root, "attachments", "mockup.png"))).toBe(true);
  });
});

describe("dev-only Demo/Worst toggle (data boundary)", () => {
  it("defaults to demo, switches on TN_DATA=worst only", () => {
    expect(resolveDataset({ ...process.env })).toBe("demo");
    expect(resolveDataset({ ...process.env, TN_DATA: "worst" })).toBe("worst");
    expect(resolveDataset({ ...process.env, TN_DATA: "production" })).toBe("demo");
  });

  it("points at the workspace-folder data boundary", () => {
    expect(datasetRoot("demo", "/repo")).toBe(resolve("/repo", "demo-workspace"));
    expect(datasetRoot("worst", "/repo")).toBe(resolve("/repo", "demo-workspace-worst"));
    expect(resolveDatasetRoot({ ...process.env, TN_DATA: "worst" }, "/repo")).toBe(
      resolve("/repo", "demo-workspace-worst"),
    );
  });

  it("toggle lives outside production code (test/fixture/scripts only)", () => {
    for (const file of ["App.tsx", "components/today-pane.tsx", "components/chrome.tsx"]) {
      expect(rendererSource(file)).not.toContain("TN_DATA");
    }
    const css = readFileSync(
      join(__dirname, "..", "..", "apps", "desktop", "src", "renderer", "styles", "app.css"),
      "utf8",
    );
    expect(css).not.toContain("worst-case");
  });

  it("preserves the pre-existing dirty welcome-state WIP untouched", () => {
    const app = rendererSource("App.tsx");
    expect(app).toContain("update-banner");
    expect(rendererSource("components/welcome.tsx")).toContain("recent-item");
  });
});
