/** Dev-only Linux smoke test (not packaged, not part of the product).
 * Spawns the built app under Electron, attaches via Chrome DevTools Protocol
 * using Node's built-in WebSocket, and asserts:
 *   1. a renderer page loads,
 *   2. React mounted content into #root,
 *   3. window.takenotes exposes the narrow bridge (no ipcRenderer/fs leak).
 * Usage: LD_LIBRARY_PATH=.dev-libs/usr/lib/x86_64-linux-gnu node scripts/smoke-linux.mjs
 */
import { spawn } from "node:child_process";

const DEBUG_PORT = 19222;
const LIB = new URL("../.dev-libs/usr/lib/x86_64-linux-gnu", import.meta.url).pathname;

const child = spawn("./node_modules/.bin/electron", [".", `--remote-debugging-port=${DEBUG_PORT}`], {
  shell: false,
  env: {
    ...process.env,
    LD_LIBRARY_PATH: `${LIB}:${process.env.LD_LIBRARY_PATH ?? ""}`,
    ELECTRON_DISABLE_SANDBOX: "1", // containers lack userns sandbox; never set in production
  },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stderr.on("data", (c) => process.stderr.write(`[electron] ${c}`));

function cdpEvaluate(wsUrl, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.addEventListener("error", reject);
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true } }));
    });
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data));
      if (msg.id === 1) {
        ws.close();
        if (msg.result?.exceptionDetails) reject(new Error(JSON.stringify(msg.result.exceptionDetails).slice(0, 500)));
        else resolve(msg.result?.result?.value);
      }
    });
    setTimeout(() => reject(new Error("CDP evaluate timeout")), 15000);
  });
}

const deadline = Date.now() + 60000;
let page = null;
while (Date.now() < deadline) {
  try {
    const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const targets = await res.json();
    // Wait for OUR page (index.html), not an early about:blank target.
    page = targets.find((t) => t.type === "page" && t.url.includes("dist/renderer/index.html"));
    if (page) break;
  } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 500));
}
if (!page) {
  child.kill();
  console.error("SMOKE FAIL: app page (dist/renderer/index.html) never appeared within 60s");
  process.exit(1);
}
// Wait for document load + React mount.
for (let i = 0; i < 60; i++) {
  const ready = await cdpEvaluate(page.webSocketDebuggerUrl, "document.readyState").catch(() => "");
  if (ready === "complete") break;
  await new Promise((r) => setTimeout(r, 500));
}
// Collect renderer console errors for diagnostics.
const consoleErrors = await cdpEvaluate(
  page.webSocketDebuggerUrl,
  "JSON.stringify((window.__smokeErrors || []))",
).catch(() => "[]");

const checks = {
  title: await cdpEvaluate(page.webSocketDebuggerUrl, "document.title"),
  rootMounted: await cdpEvaluate(page.webSocketDebuggerUrl, "document.getElementById('root').textContent.length > 50"),
  rootSample: await cdpEvaluate(
    page.webSocketDebuggerUrl,
    "document.getElementById('root').textContent.slice(0, 120)",
  ),
  bridgePresent: await cdpEvaluate(page.webSocketDebuggerUrl, "typeof window.takenotes === 'object'"),
  bridgeKeys: await cdpEvaluate(page.webSocketDebuggerUrl, "Object.keys(window.takenotes).sort().join(',')"),
  noIpcLeak: await cdpEvaluate(page.webSocketDebuggerUrl, "typeof window.ipcRenderer === 'undefined'"),
  noRequireLeak: await cdpEvaluate(page.webSocketDebuggerUrl, "typeof window.require === 'undefined'"),
  noNodeProcessLeak: await cdpEvaluate(page.webSocketDebuggerUrl, "typeof window.process === 'undefined'"),
};
console.log(JSON.stringify({ ...checks, consoleErrors: JSON.parse(consoleErrors) }, null, 2));

const pass =
  checks.rootMounted === true &&
  checks.bridgePresent === true &&
  checks.bridgeKeys === "app,directory,events,file,search,workspace" &&
  checks.noIpcLeak === true &&
  checks.noRequireLeak === true &&
  checks.noNodeProcessLeak === true;

function cdpCaptureScreenshot(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.addEventListener("error", reject);
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ id: 2, method: "Page.captureScreenshot", params: { format: "png" } }));
    });
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data));
      if (msg.id === 2) {
        ws.close();
        resolve(msg.result?.data);
      }
    });
    setTimeout(() => reject(new Error("CDP screenshot timeout")), 15000);
  });
}

try {
  const png = await cdpCaptureScreenshot(page.webSocketDebuggerUrl);
  if (png) {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync("smoke-artifacts", { recursive: true });
    writeFileSync("smoke-artifacts/window.png", Buffer.from(png, "base64"));
    console.log("Screenshot: smoke-artifacts/window.png");
  }
} catch (err) {
  console.error(`Screenshot skipped: ${err}`);
}

child.kill();
if (!pass) {
  console.error("SMOKE FAIL: renderer/bridge assertions did not hold");
  process.exit(1);
}
console.log("SMOKE PASS: window launched, React mounted, narrow bridge intact, no Node leaks");
