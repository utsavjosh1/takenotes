import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ERROR_WORDS } from "@takenotes/contracts/errors";
import { WEB_UI_HTML } from "@takenotes/server/web-ui";
import { palette } from "@takenotes/ui/native";
import { colors, publicColors } from "@takenotes/ui";

/** M5: the apps must look and read the same because they share one source,
 * not because each copy was tuned to match. */
const ROOT = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
function walk(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === "node_modules" || n === "dist") return [];
    return statSync(p).isDirectory() ? walk(p, ext) : ext.test(n) ? [p] : [];
  });
}

describe("one token source", () => {
  it("desktop and web load the shared tokens before their own styles", () => {
    for (const main of [read("apps/desktop/src/renderer/main.tsx"), read("apps/web/src/main.tsx")]) {
      expect(main).toContain('"@takenotes/ui/tokens.css"');
      expect(main.indexOf("@takenotes/ui/tokens.css")).toBeLessThan(main.indexOf("dom.css"));
    }
  });
  it("the server page embeds the same generated CSS", () => {
    expect(WEB_UI_HTML).toContain(read("packages/ui/src/tokens.css").slice(0, 400));
  });
  it("mobile resolves colours from the same table", () => {
    for (const theme of ["light", "dark"] as const) {
      for (const [name, key] of Object.entries(publicColors)) {
        if (name === "shadow") continue;
        expect(palette(theme)[name as keyof ReturnType<typeof palette>]).toBe(colors[theme][key]);
      }
    }
  });
  it("no app redefines the palette", () => {
    for (const css of [...walk(join(ROOT, "apps/desktop/src"), /\.css$/), ...walk(join(ROOT, "apps/web/src"), /\.css$/)]) {
      const text = readFileSync(css, "utf8");
      // Accent presets are the one sanctioned override.
      const body = text.replace(/\[data-theme="dark"\]\[data-accent[^{]*\{[^}]*\}|\[data-accent[^{]*\{[^}]*\}/g, "");
      expect(body, css).not.toMatch(/^\s*--(app|side|editor|panel|overlay|hover|selected|text|text2|muted|faint|line|control|ok|warn|bad):/m);
    }
  });
});

describe("one theme switch", () => {
  it("every app themes through data-theme", () => {
    expect(read("apps/desktop/src/renderer/App.tsx")).toContain("dataset.theme");
    expect(read("apps/web/src/theme.ts")).toContain("dataset.theme");
    expect(read("packages/ui/src/tokens.css")).toContain(':root:not([data-theme="light"])');
    expect(read("packages/ui/src/dom/theme-api.ts")).toContain("dataset.theme");
  });
  it("the preview in the web site is themed by the same attribute", () => {
    expect(read("apps/web/src/components/NotebookPreview.tsx")).toContain("data-theme=");
  });
});

describe("one set of components", () => {
  const COMPONENT_CLASS = /^\s*\.(btn|button|toast|toasts|banner|modal|dialog|menu|chip|badge|switch|tooltip|popover)(?![\w-])/m;
  it("apps do not style their own buttons, dialogs, menus, toasts, banners or chips", () => {
    for (const css of [...walk(join(ROOT, "apps/desktop/src"), /\.css$/), ...walk(join(ROOT, "apps/web/src"), /\.css$/)]) {
      expect(readFileSync(css, "utf8"), css).not.toMatch(COMPONENT_CLASS);
    }
  });
  it("desktop swaps its old overlays for the shared ones", () => {
    const sources = walk(join(ROOT, "apps/desktop/src/renderer"), /\.tsx?$/).map((f) => readFileSync(f, "utf8")).join("\n");
    for (const shared of ["<Menu", "<Tabs", "<CommandPalette", "ToastProvider", "<Rail", "SharedTitleBar", "SharedStatusBar"]) expect(sources).toContain(shared);
    expect(sources).not.toMatch(/className="(ctx-item|cmd-item|toast|tabstrip)"/);
  });
  it("one icon family: desktop adapts the shared set", () => {
    expect(read("apps/desktop/src/renderer/components/icons.tsx")).toContain("@takenotes/ui/dom");
    expect(read("apps/desktop/src/renderer/components/icons.tsx")).not.toContain("<path");
  });
});

describe("one voice for errors", () => {
  it("the server page ships the contracts table, not its own", () => {
    expect(WEB_UI_HTML).toContain(JSON.stringify(ERROR_WORDS));
  });
  it("desktop headlines come from the same table", () => {
    expect(read("apps/desktop/src/renderer/error-text.ts")).toContain("ERROR_WORDS");
  });
  it("every title is distinct enough to tell a lockout from a missing file", () => {
    expect(ERROR_WORDS.PERMISSION_DENIED.title).not.toBe(ERROR_WORDS.NOT_FOUND.title);
    expect(ERROR_WORDS.DISCONNECTED.title).not.toBe(ERROR_WORDS.NOT_FOUND.title);
  });
});

describe("one shape", () => {
  it("no app stylesheet rounds past 10px except pills and circles", () => {
    for (const css of [...walk(join(ROOT, "apps/desktop/src"), /\.css$/), ...walk(join(ROOT, "apps/web/src"), /\.css$/), join(ROOT, "packages/ui/src/dom/styles.css")]) {
      for (const m of readFileSync(css, "utf8").matchAll(/radius[a-z-]*:\s*([^;}]+)/g)) {
        for (const v of m[1]!.trim().split(/\s+/)) {
          if (/^\d/.test(v)) expect(v === "50%" || v === "0" || Number(v.replace("px", "")) <= 10, `${css}: ${v}`).toBe(true);
        }
      }
    }
  });
});
