import { describe, expect, it } from "vitest";
import { statusSegments } from "../../src/renderer/status";

/** P1-06 acceptance 2: every status segment follows workspace switches;
 * disconnected WSL renders honestly, never as saved/clean. */
describe("status segments", () => {
  it("local workspace shows Windows identity without user noise", () => {
    const s = statusSegments({
      displayName: "Notes",
      kind: "windows-local",
      connection: "connected",
      doc: "saved",
      savedAt: "10:00",
      fileCount: 42,
    });
    expect(s).toMatchObject({
      workspace: "Notes",
      platform: "Windows",
      save: "Saved 10:00",
      connection: "Connected",
      files: "42 files",
    });
  });

  it("wsl workspace shows distro + linuxUser from identity fields", () => {
    const s = statusSegments({
      displayName: "Ubuntu:work:~/Notes",
      kind: "windows-wsl",
      distro: "Ubuntu",
      linuxUser: "work",
      connection: "connected",
      doc: "dirty",
      fileCount: 7,
    });
    expect(s.platform).toBe("WSL · Ubuntu · work");
    expect(s.save).toBe("Unsaved");
    expect(s.connection).toBe("Connected");
  });

  it("linuxUser comes from the identity field, never parsed from the name", () => {
    // Even if the display name carried no user, the selected identity wins.
    const s = statusSegments({
      displayName: "Company notes",
      kind: "windows-wsl",
      distro: "Ubuntu",
      linuxUser: "work",
      connection: "connected",
      doc: "clean",
      fileCount: 1,
    });
    expect(s.platform).toBe("WSL · Ubuntu · work");
    expect(s.files).toBe("1 file");
  });

  it("switching workspaces updates every segment", () => {
    const local = statusSegments({
      displayName: "Notes",
      kind: "windows-local",
      connection: "connected",
      doc: "saved",
      savedAt: "10:00",
      fileCount: 42,
    });
    const wsl = statusSegments({
      displayName: "Ubuntu:work:~/Notes",
      kind: "windows-wsl",
      distro: "Ubuntu",
      linuxUser: "work",
      connection: "connected",
      doc: "conflict",
      fileCount: 7,
    });
    expect(wsl.workspace).not.toBe(local.workspace);
    expect(wsl.platform).not.toBe(local.platform);
    expect(wsl.save).toBe("Conflict");
    expect(wsl.files).not.toBe(local.files);
  });

  it("disconnected WSL shows Unavailable, never Saved or Conflict", () => {
    const s = statusSegments({
      displayName: "Ubuntu:work:~/Notes",
      kind: "windows-wsl",
      distro: "Ubuntu",
      linuxUser: "work",
      connection: "disconnected",
      doc: "saved",
      fileCount: 7,
    });
    expect(s.connection).toBe("Unavailable");
    expect(s.save).not.toBe("Conflict");
  });

  it("reconnecting and failed connections read distinctly", () => {
    const r = statusSegments({
      displayName: "N",
      kind: "windows-local",
      connection: "reconnecting",
      doc: "clean",
      fileCount: 0,
    });
    expect(r.connection).toBe("Reconnecting…");
    expect(r.files).toBe("0 files");
    const f = statusSegments({
      displayName: "N",
      kind: "windows-local",
      connection: "failed",
      doc: "error",
      fileCount: 0,
    });
    expect(f.connection).toBe("Failed");
    expect(f.save).toBe("Error");
  });

  it("saving state is visible distinctly from dirty", () => {
    const s = statusSegments({
      displayName: "N",
      kind: "linux-local",
      connection: "connected",
      doc: "saving",
      fileCount: 3,
    });
    expect(s.save).toBe("Saving…");
  });
});
