import { spawn } from "node:child_process";
import { decodeWslListOutput } from "./output-decoder.js";

export type WslDistribution = { name: string };

/** List installed WSL distributions via `wsl.exe --list --quiet`. Windows-only. */
export function listDistributions(timeoutMs = 15000): Promise<WslDistribution[]> {
  return new Promise((resolve, reject) => {
    const child = spawn("wsl.exe", ["--list", "--quiet"], { shell: false, timeout: timeoutMs });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`wsl.exe --list --quiet exited with code ${code}`));
        return;
      }
      resolve(decodeWslListOutput(Buffer.concat(chunks)).map((name) => ({ name })));
    });
  });
}
