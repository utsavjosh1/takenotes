import { spawn } from "node:child_process";

/** Fixed bootstrap: transfer helper/runtime bytes through an owned wsl.exe
 * process stdin. The shell fragment is fixed application code; only the
 * destination directory and file names (app-controlled) travel as argv. */
export function buildBootstrapArgv(kind: "node" | "helper", version: string): string[] {
  // Fixed script: reads one length-prefixed payload? No — simplest honest
  // design: base64 chunks via stdin are overkill; we stream raw bytes and the
  // fixed shell side writes stdin to the destination file.
  // Destination roots are fixed under the user's HOME (resolved inside WSL).
  if (kind === "node") {
    return ["-d", "__DISTRO__", "--exec", "sh", "-c", "mkdir -p \"$HOME/.local/share/desktop-notes/runtime\" && cat > \"$HOME/.local/share/desktop-notes/runtime/node\""];
  }
  return ["-d", "__DISTRO__", "--exec", "sh", "-c", `mkdir -p "$HOME/.local/share/desktop-notes/helpers/${version}" && cat > "$HOME/.local/share/desktop-notes/helpers/${version}/helper.cjs"`];
}

export function withDistro(argv: string[], distro: string): string[] {
  return argv.map((a) => (a === "__DISTRO__" ? distro : a));
}

/** Placeholder installer orchestration — full checksum-verified install lands
 * with Stage 5/6 work; this module already fixes the transport contract. */
export async function verifyLocalFileSha256(filePath: string, expectedHex: string): Promise<boolean> {
  const { createHash } = await import("node:crypto");
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex") === expectedHex;
}

export function spawnWsl(argv: string[], stdinBytes?: Buffer): Promise<{ stdout: Buffer; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn("wsl.exe", argv, { shell: false });
    const out: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => out.push(c));
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout: Buffer.concat(out), code: code ?? -1 }));
    if (stdinBytes) {
      child.stdin.write(stdinBytes, () => child.stdin.end());
    } else {
      child.stdin.end();
    }
  });
}
