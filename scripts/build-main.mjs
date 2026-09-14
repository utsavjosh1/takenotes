/** Build Electron main + preload with esbuild (no framework magic). */
import { build } from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync("dist-electron/main", { recursive: true });
mkdirSync("dist-electron/preload", { recursive: true });

await build({
  entryPoints: ["src/main/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist-electron/main/index.js",
  external: ["electron"],
  sourcemap: false,
  logLevel: "info",
});

await build({
  entryPoints: ["src/preload/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist-electron/preload/index.js",
  external: ["electron"],
  sourcemap: false,
  logLevel: "info",
});

console.log("Electron main + preload built.");
