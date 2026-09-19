import { describe, expect, it, vi } from "vitest";
import { parseWslVerboseList } from "../../src/main/wsl/output-decoder";
import { listDistributions } from "../../src/main/wsl/distributions";
import { WorkspaceService } from "../../src/main/services/workspace-service";
import { WorkspaceRegistry } from "../../src/main/workspace/registry";

function utf16le(text: string, withBom: boolean): Buffer {
  const body = Buffer.from(text, "utf16le");
  return withBom ? Buffer.concat([Buffer.from([0xff, 0xfe]), body]) : body;
}

const VERBOSE = [
  "  NAME                   STATE           VERSION",
  "* Ubuntu                 Running         2",
  "  Debian                 Stopped         2",
  "  Ubuntu-20.04           Stopped         1",
  "",
].join("\r\n");

describe("parseWslVerboseList", () => {
  it("parses names, states, versions, and the default marker", () => {
    expect(parseWslVerboseList(Buffer.from(VERBOSE, "utf8"))).toEqual([
      { name: "Ubuntu", state: "Running", version: "2", isDefault: true },
      { name: "Debian", state: "Stopped", version: "2", isDefault: false },
      { name: "Ubuntu-20.04", state: "Stopped", version: "1", isDefault: false },
    ]);
  });

  it("decodes UTF-16LE with BOM (how wsl.exe actually writes)", () => {
    expect(parseWslVerboseList(utf16le(VERBOSE, true))).toEqual([
      { name: "Ubuntu", state: "Running", version: "2", isDefault: true },
      { name: "Debian", state: "Stopped", version: "2", isDefault: false },
      { name: "Ubuntu-20.04", state: "Stopped", version: "1", isDefault: false },
    ]);
  });

  it("keeps distro names with spaces and unusual valid characters", () => {
    const raw = ["  NAME                   STATE           VERSION", "* My Custom Distro!    Stopped         2", ""].join("\r\n");
    expect(parseWslVerboseList(Buffer.from(raw, "utf8"))).toEqual([
      { name: "My Custom Distro!", state: "Stopped", version: "2", isDefault: true },
    ]);
  });

  it("returns [] for header-only output (no distros installed)", () => {
    const raw = "  NAME                   STATE           VERSION\r\n";
    expect(parseWslVerboseList(Buffer.from(raw, "utf8"))).toEqual([]);
  });

  it("returns [] for empty or malformed output (caller falls back)", () => {
    expect(parseWslVerboseList(Buffer.alloc(0))).toEqual([]);
    expect(parseWslVerboseList(Buffer.from("some garbage\nno header here\n", "utf8"))).toEqual([]);
  });
});

describe("listDistributions orchestration (injected runner, no wsl.exe)", () => {
  it("prefers verbose output and never spawns start flags", async () => {
    const run = vi.fn(async (_args: string[]) => ({ code: 0 as number | null, output: Buffer.from(VERBOSE, "utf8") }));
    const out = await listDistributions(15000, run);
    expect(out[0]).toMatchObject({ name: "Ubuntu", state: "Running", version: "2", isDefault: true });
    expect(run).toHaveBeenCalledTimes(1);
    const argv = run.mock.calls[0]![0];
    expect(argv).toEqual(["-l", "-v"]);
    expect(argv.join(" ")).not.toMatch(/--start|-d\b|run/);
  });

  it("falls back to quiet names when verbose fails", async () => {
    const run = vi.fn(async (args: string[]) =>
      args.includes("-v")
        ? { code: 1 as number | null, output: Buffer.alloc(0) }
        : { code: 0 as number | null, output: Buffer.from("Ubuntu\r\nDebian\r\n", "utf8") },
    );
    const out = await listDistributions(15000, run);
    expect(out).toEqual([{ name: "Ubuntu" }, { name: "Debian" }]);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[1]![0]).toEqual(["--list", "--quiet"]);
  });

  it("falls back to quiet names when verbose output is malformed", async () => {
    const run = vi.fn(async (args: string[]) =>
      args.includes("-v")
        ? { code: 0 as number | null, output: Buffer.from("???\n", "utf8") }
        : { code: 0 as number | null, output: Buffer.from("Ubuntu\r\n", "utf8") },
    );
    expect(await listDistributions(15000, run)).toEqual([{ name: "Ubuntu" }]);
  });

  it("rejects when both verbose and quiet fail (wsl.exe unavailable)", async () => {
    const run = vi.fn(async (_args: string[]) => {
      throw new Error("spawn wsl.exe ENOENT");
    });
    await expect(listDistributions(15000, run)).rejects.toThrow();
  });
});

describe("WorkspaceService distro seam (P1-01 dependency)", () => {
  it("delegates listing to the injected distro source", async () => {
    const source = vi.fn(async () => [{ name: "Ubuntu", state: "Running", version: "2", isDefault: true }]);
    const svc = new WorkspaceService(new WorkspaceRegistry(), source);
    await expect(svc.listDistributions()).resolves.toEqual([
      { name: "Ubuntu", state: "Running", version: "2", isDefault: true },
    ]);
    expect(source).toHaveBeenCalledTimes(1);
  });
});
