import { describe, expect, it } from "vitest";
import { WorkspaceRegistry, toWorkspaceInfo } from "../../src/main/workspace/registry";
import { workspaceKeyFor } from "../../src/main/workspace/drafts";

describe("WSL per-user workspace identity (acceptance 3)", () => {
  it("same distro+path under two users yields two workspaceIds", () => {
    const registry = new WorkspaceRegistry();
    const a = registry.register("windows-wsl", "Ubuntu:utsav:~/Notes", "/home/utsav/Notes", "Ubuntu", "utsav");
    const b = registry.register("windows-wsl", "Ubuntu:work:~/Notes", "/home/utsav/Notes", "Ubuntu", "work");
    expect(a.id).not.toBe(b.id);
    expect(registry.get(a.id)?.linuxUser).toBe("utsav");
    expect(registry.get(b.id)?.linuxUser).toBe("work");
    // Closing one leaves the other usable.
    registry.close(a.id);
    expect(registry.get(a.id)).toBeUndefined();
    expect(registry.get(b.id)?.id).toBe(b.id);
  });

  it("toWorkspaceInfo carries distro+linuxUser explicitly (P1-06 status strip never parses names)", () => {
    const registry = new WorkspaceRegistry();
    const wsl = registry.register("windows-wsl", "Ubuntu:work:~/Notes", "/home/work/Notes", "Ubuntu", "work");
    expect(toWorkspaceInfo(wsl)).toMatchObject({ distro: "Ubuntu", linuxUser: "work" });
    const local = registry.register("windows-local", "Notes", "C:\\notes");
    expect(toWorkspaceInfo(local)).not.toHaveProperty("distro");
    expect(toWorkspaceInfo(local)).not.toHaveProperty("linuxUser");
  });

  it("workspaceKeyFor differs across Linux users", () => {
    const base = { workspaceType: "windows-wsl" as const, workspaceRoot: "/home/utsav/Notes", distro: "Ubuntu" };
    const a = workspaceKeyFor({ ...base, linuxUser: "utsav" });
    const b = workspaceKeyFor({ ...base, linuxUser: "work" });
    expect(a).not.toBe(b);
    // Native workspaces are unaffected by the new field.
    expect(
      workspaceKeyFor({ workspaceType: "windows-local" as const, workspaceRoot: "C:\\notes" }),
    ).toBe(workspaceKeyFor({ workspaceType: "windows-local" as const, workspaceRoot: "C:\\notes" }));
  });
});
