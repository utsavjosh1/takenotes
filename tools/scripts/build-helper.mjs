/** Bundle the WSL helper to a single helper.cjs (Node-side, platform linux). */
import { build } from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync("dist-helper", { recursive: true });

await build({
  entryPoints: ["tools/wsl-helper/src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  outfile: "dist-helper/helper.cjs",
  alias: {
    "@takenotes/contracts/protocol-version": "./packages/contracts/src/protocol-version.ts",
    "@takenotes/contracts/protocol": "./packages/contracts/src/protocol.ts",
    "@takenotes/contracts/errors": "./packages/contracts/src/errors.ts",
  },
  sourcemap: false,
  logLevel: "info",
});

console.log("WSL helper built: dist-helper/helper.cjs");
