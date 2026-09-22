/** Bundle the self-hosted server to a single dist-server/server.cjs (Node-side). */
import { build } from "esbuild";
import { mkdirSync, readFileSync } from "node:fs";

mkdirSync("dist-server", { recursive: true });
const version = JSON.parse(readFileSync("package.json", "utf8")).version ?? "0.0.0-dev";

await build({
  entryPoints: ["src/server/main.ts"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  outfile: "dist-server/server.cjs",
  sourcemap: false,
  logLevel: "info",
  define: { __TAKENOTES_VERSION__: JSON.stringify(version) },
});

console.log("takenotes server built: dist-server/server.cjs");
