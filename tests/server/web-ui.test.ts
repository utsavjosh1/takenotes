import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTakenotesServer } from "@takenotes/server/app";
import { SingleOwnerAuth } from "@takenotes/server/auth";
import { PersistentServerWorkspaceRegistry } from "@takenotes/server/workspace-registry";
import { ERROR_WORDS, WEB_UI_HTML } from "@takenotes/server/web-ui";
import { domCss, tokensCss } from "@takenotes/ui/generated";
import { colors, contrastRatio, publicColors } from "@takenotes/ui";

const script = /<script>([\s\S]*)<\/script>/.exec(WEB_UI_HTML)![1]!;
const style = /<style>([\s\S]*?)<\/style>/.exec(WEB_UI_HTML)![1]!;
const pageCss = style.replace(tokensCss, "").replace(domCss, "");
const markup = WEB_UI_HTML.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<script>[\s\S]*<\/script>/, "");
const visible = markup.replace(/<[^>]+>/g, " ") + " " + [...script.matchAll(/"([^"\n]{12,})"/g)].map((m) => m[1]).join(" ");

describe("server page: shared design", () => {
  it("serves the page at /", async () => {
    const dir = mkdtempSync(join(tmpdir(), "takenotes-webui-"));
    const registry = new PersistentServerWorkspaceRegistry(join(dir, "workspaces.json"));
    const app = createTakenotesServer({ registry, auth: new SingleOwnerAuth({ session: { sessionId: "s", csrfToken: "c" } }) });
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toBe(WEB_UI_HTML);
  });

  it("embeds the generated tokens and component styles", () => {
    expect(style).toContain("--accent: var(--tn-accent)");
    expect(style).toContain(".tn-button {");
    expect(style).toContain("prefers-color-scheme: dark");
  });

  it("page-specific CSS has no raw colours, radii or component styles", () => {
    expect(pageCss).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(pageCss).not.toMatch(/rgba?\(/);
    expect(pageCss).not.toMatch(/border-radius:\s*\d/);
    expect(pageCss).not.toMatch(/\.(btn|button|banner|toast|dialog|chip|badge)\b/);
  });

  it("uses shared classes, not local copies", () => {
    for (const cls of ["tn-button", "tn-field-control", "ui-banner", "ui-card", "ui-table", "ui-titlebar", "ui-check"]) {
      expect(WEB_UI_HTML).toContain(cls);
    }
  });

  it("every colour pair the page adds is readable in both themes", () => {
    for (const theme of ["light", "dark"] as const) {
      const c = (n: keyof typeof publicColors) => colors[theme][publicColors[n]];
      expect(contrastRatio(c("muted"), c("editor"))).toBeGreaterThanOrEqual(4.5); // hints on cards
      expect(contrastRatio(c("text"), c("code"))).toBeGreaterThanOrEqual(4.5);   // access key blocks
      expect(contrastRatio(c("bad"), c("editor"))).toBeGreaterThanOrEqual(4.5);   // field errors
    }
  });
});

describe("server page: behaviour kept", () => {
  it("the script is valid JavaScript", () => {
    expect(() => new Function(script)).not.toThrow();
  });

  it("keeps every element the flow depends on", () => {
    for (const id of ["view-login", "view-app", "password", "btn-login", "login-error", "workspaces", "btn-refresh", "btn-logout",
      "note-path", "btn-open", "status", "conflict", "editor", "btn-save", "agent-label", "agent-workspace", "agent-readonly",
      "btn-agent-create", "agent-status", "agent-new", "agent-token", "agent-config", "agent-table"]) {
      expect(markup, id).toContain(`id="${id}"`);
    }
  });

  it("calls the same API surface", () => {
    for (const path of ["/api/auth/login", "/api/auth/logout", "/api/auth/session", "/api/rpc/workspace.list", "/api/rpc/note.read",
      "/api/rpc/note.update", "/api/rpc/agents.list", "/api/rpc/agents.create", "/api/rpc/agents.revoke"]) {
      expect(script, path).toContain(path);
    }
    expect(script).toContain("x-csrf-token");
    expect(script).toContain("expectedHash");
  });

  it("login is a real form so Enter submits", () => {
    expect(markup).toMatch(/<form id="login-form"/);
    expect(markup).toContain('type="submit"');
  });

  it("revoking asks first, with Cancel focused", () => {
    expect(script).toContain("confirmRevoke");
    expect(script).toContain("cancel.focus()");
    expect(script).toContain("showModal()");
  });
});

describe("server page: plain words", () => {
  it("avoids banned interface words", () => {
    // The pasted agent config legitimately names the mcp helper file.
    expect(visible.replace("takenotes-mcp.cjs", "")).not.toMatch(/\b(backlinks?|outline|properties|frontmatter|markdown|vault|wikilinks?|MCP)\b/i);
  });

  it("never shows raw error codes in the visible words", () => {
    for (const [code, words] of Object.entries(ERROR_WORDS)) {
      expect(`${words.title} ${words.cause}`).not.toContain(code);
      expect(words.title.length).toBeGreaterThan(0);
      expect(words.cause).toMatch(/[.]$/);
    }
    expect(script).not.toMatch(/"(Open|Save) failed: "/);
  });

  it("keeps technical text inside a collapsed Details", () => {
    expect(script).toContain('el("summary", "", "Details")');
    expect(script).not.toContain('d.open = true');
  });

  it("has loading, empty, error and offline states", () => {
    expect(script).toContain("function skeleton");
    expect(script).toContain("function empty");
    expect(script).toContain("function fail");
    expect(script).toContain("Can't reach the server.");
    expect(script).toContain("No workspaces yet");
    expect(script).toContain("No AI agents yet");
  });
});
