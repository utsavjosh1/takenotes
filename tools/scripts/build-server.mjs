/** Bundle the self-hosted server to a single dist-server/server.cjs (Node-side). */
import { build } from "esbuild";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

mkdirSync("dist-server", { recursive: true });
const version = JSON.parse(readFileSync("package.json", "utf8")).version ?? "0.0.0-dev";

await build({
  entryPoints: ["apps/server/src/main.ts"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  outfile: "dist-server/server.cjs",
  sourcemap: false,
  logLevel: "info",
  define: { __TAKENOTES_VERSION__: JSON.stringify(version) },
});

const runtimeTarget = "resources/wsl/linux-x64/runtime.cjs";
mkdirSync("resources/wsl/linux-x64", { recursive: true });
copyFileSync("dist-server/server.cjs", runtimeTarget);
const manifestPath = "resources/wsl/linux-x64/manifest.json";
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.runtimeSha256 = createHash("sha256").update(readFileSync(runtimeTarget)).digest("hex");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
console.log("takenotes server built: dist-server/server.cjs");
console.log("WSL HTTP runtime staged: resources/wsl/linux-x64/runtime.cjs");
