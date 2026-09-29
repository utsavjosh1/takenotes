/** Dev orchestration: build main/preload/helper/runtime, start Vite, launch Electron.
 * Renderer HMR does not restart Electron; main/preload rebuilds do. */
import { spawn } from "node:child_process";

function run(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { stdio: "inherit", shell: false, ...opts });
  return child;
}

console.log("Building main/preload/helper/runtime…");
const { execFileSync } = await import("node:child_process");
execFileSync("node", ["tools/scripts/build-main.mjs"], { stdio: "inherit" });
execFileSync("node", ["tools/scripts/build-server.mjs"], { stdio: "inherit" });
execFileSync("node", ["tools/scripts/build-helper.mjs"], { stdio: "inherit" });

const vite = run("npx", ["vite", "--host", "127.0.0.1"]);
let electron = null;

function launchElectron() {
  if (electron) electron.kill();
  electron = run("npx", ["electron", ".", "--dev", "--disable-gpu"], { env: { ...process.env, VITE_DEV_SERVER_URL: "http://127.0.0.1:5173/" } });
}

launchElectron();

const cleanup = () => {
  vite.kill();
  electron?.kill();
  process.exit(0);
};
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
