import { describe, expect, it } from "vitest";
import { listDistributions } from "../../src/main/wsl/distributions";

/** Windows-only live evidence (runs in Windows CI, skipped on Linux):
 * listing distributions is read-only — a stopped distro stays stopped.
 * `wsl.exe -l -v` never starts a distribution; only an explicit
 * Connect/Open (P1-03+) spawns into one. Record results in docs/mvp-status.md. */
describe.runIf(process.platform === "win32" && process.env["TAKENOTES_LIVE_WSL"] === "1")("distro listing leaves stopped distros stopped (live wsl.exe)", () => {
  it("repeated listings report identical states", async () => {
    const before = await listDistributions();
    expect(before.length).toBeGreaterThan(0);
    for (const d of before) {
      expect(typeof d.name).toBe("string");
      expect(d.name.length).toBeGreaterThan(0);
    }
    const after = await listDistributions();
    expect(after).toEqual(before);
    // Any distro Stopped before the listings must still be Stopped after:
    // proof the list path performed no autostart.
    for (const d of after.filter((x) => x.state === "Stopped")) {
      const match = before.find((x) => x.name === d.name);
      expect(match?.state).toBe("Stopped");
    }
  });
});
