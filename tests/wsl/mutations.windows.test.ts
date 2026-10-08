import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { listDistributions } from "@takenotes/desktop/main/wsl/distributions";
import { filterCandidateUsers, parsePasswd } from "@takenotes/wsl-helper/users";

/** Windows-only live evidence (runs on a prepared host, skipped on Linux):
 * identity, home separation, and 700-permission enforcement against a real
 * distro with two Linux users. Needs only `wsl.exe` — no Electron, no staged
 * runtime — so it validates the OS-level facts the helper relies on:
 * `-u` selects the Linux identity, `~`/HOME is per-user, and EACCES from a
 * 700-private tree is what the helper maps to PERMISSION_DENIED (7d pins the
 * mapping over the real wire; this pins the ground truth underneath it).
 * Record results in docs/archive/status/wsl-status.md — do NOT claim
 * verification from Linux. */
describe.runIf(process.platform === "win32" && process.env["TAKENOTES_LIVE_WSL"] === "1")("wsl identity and permission ground truth on a live distro", () => {
  function runWsl(args: string[], timeoutMs = 60000): Promise<{ code: number | null; output: Buffer }> {
    return new Promise((resolve, reject) => {
      const child = spawn("wsl.exe", args, { shell: false, timeout: timeoutMs });
      const chunks: Buffer[] = [];
      child.stdout.on("data", (c: Buffer) => chunks.push(c));
      child.on("error", (err) => reject(err));
      child.on("close", (code) => resolve({ code, output: Buffer.concat(chunks) }));
    });
  }

  async function asUser(distro: string, user: string, argv: string[]): Promise<{ code: number | null; out: string }> {
    const r = await runWsl(["-d", distro, "-u", user, "--exec", ...argv]);
    return { code: r.code, out: r.output.toString("utf8").trim() };
  }

  /** First two interactive users (uid ≥ 1000, non-root) per the runbook. */
  async function twoUsers(distro: string): Promise<{ a: { name: string; home: string }; b: { name: string; home: string } }> {
    const cat = await runWsl(["-d", distro, "--exec", "cat", "/etc/passwd"]);
    expect(cat.code).toBe(0);
    const candidates = filterCandidateUsers(parsePasswd(cat.output.toString("utf8")), { currentUid: -1 }).filter(
      (u) => u.uid !== 0,
    );
    expect(
      candidates.length >= 2,
      `need two non-root interactive users in ${distro} (runbook §provision); found: ${candidates.map((u) => u.name).join(", ")}`,
    ).toBe(true);
    const [a, b] = candidates;
    return (
      { a: { name: a!.name, home: a!.home }, b: { name: b!.name, home: b!.home } }
    );
  }

  it("lists a usable distro for the evidence run", async () => {
    const distros = await listDistributions();
    expect(distros.length).toBeGreaterThan(0);
    expect(distros[0]!.name.length).toBeGreaterThan(0);
  });

  it("-u selects the Linux identity (whoami matches, uid is unprivileged)", async () => {
    const distros = await listDistributions();
    const distro = distros[0]!.name;
    const { a, b } = await twoUsers(distro);
    for (const u of [a.name, b.name]) {
      const who = await asUser(distro, u, ["whoami"]);
      expect(who.code).toBe(0);
      expect(who.out).toBe(u);
      const uid = await asUser(distro, u, ["id", "-u"]);
      expect(uid.code).toBe(0);
      expect(uid.out).not.toBe("0");
    }
  }, 120000);

  it("per-user ~: each user resolves a distinct home matching passwd", async () => {
    const distros = await listDistributions();
    const distro = distros[0]!.name;
    const { a, b } = await twoUsers(distro);
    const homeA = await asUser(distro, a.name, ["sh", "-c", "echo $HOME"]);
    const homeB = await asUser(distro, b.name, ["sh", "-c", "echo $HOME"]);
    expect(homeA.code).toBe(0);
    expect(homeB.code).toBe(0);
    expect(homeA.out).toBe(a.home);
    expect(homeB.out).toBe(b.home);
    expect(homeA.out).not.toBe(homeB.out);
  }, 120000);

  it("700-private tree: owner reads, other user is denied (ground truth for PERMISSION_DENIED)", async () => {
    const distros = await listDistributions();
    const distro = distros[0]!.name;
    const { a, b } = await twoUsers(distro);
    const probe = `${a.home}/.takenotes-live-700`;
    try {
      const setup = await asUser(
        distro,
        a.name,
        ["sh", "-c", `mkdir -p ${probe} && echo secret > ${probe}/note.md && chmod 700 ${probe}`],
      );
      expect(setup.code).toBe(0);
      // Positive control: the owner reads the file — it exists.
      const owner = await asUser(distro, a.name, ["cat", `${probe}/note.md`]);
      expect(owner.code).toBe(0);
      expect(owner.out).toBe("secret");
      // The other user is refused by the OS — this EACCES is what the
      // helper surfaces as PERMISSION_DENIED (never escalates, never retries).
      const denied = await asUser(distro, b.name, ["cat", `${probe}/note.md`]);
      expect(denied.code).not.toBe(0);
    } finally {
      await asUser(distro, a.name, ["rm", "-rf", probe]);
    }
  }, 120000);
});
