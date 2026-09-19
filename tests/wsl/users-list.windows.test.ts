import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { listDistributions } from "../../src/main/wsl/distributions";
import { filterCandidateUsers, parsePasswd } from "../../wsl-helper/src/users";

/** Windows-only live evidence (runs in Windows CI, skipped on Linux):
 * a real installed distro yields interactive users from its own
 * `/etc/passwd`. This exercises the source data end to end; the helper
 * `users.list` round-trip itself is covered by direct-spawn tests on Linux.
 * Record results in docs/mvp-status.md — do NOT claim verification from Linux. */
describe.runIf(process.platform === "win32" && process.env["TAKENOTES_LIVE_WSL"] === "1")("linux user discovery against a live distro", () => {
  function runWsl(args: string[], timeoutMs = 30000): Promise<{ code: number | null; output: Buffer }> {
    return new Promise((resolve, reject) => {
      const child = spawn("wsl.exe", args, { shell: false, timeout: timeoutMs });
      const chunks: Buffer[] = [];
      child.stdout.on("data", (c: Buffer) => chunks.push(c));
      child.on("error", (err) => reject(err));
      child.on("close", (code) => resolve({ code, output: Buffer.concat(chunks) }));
    });
  }

  it("discovers interactive users from /etc/passwd", async () => {
    const distros = await listDistributions();
    expect(distros.length).toBeGreaterThan(0);
    const distro = distros[0]!.name;
    const cat = await runWsl(["-d", distro, "--exec", "cat", "/etc/passwd"]);
    expect(cat.code).toBe(0);
    const text = cat.output.toString("utf8");
    expect(text).toContain("root:");
    const whoami = await runWsl(["-d", distro, "--exec", "whoami"]);
    expect(whoami.code).toBe(0);
    // Discovery-equivalent filtering on live data: humans surface, the
    // default user is always present.
    const users = filterCandidateUsers(parsePasswd(text), { currentUid: 1000 });
    expect(users.length).toBeGreaterThan(0);
    for (const u of users) {
      expect(u.home.startsWith("/")).toBe(true);
    }
  });
});
