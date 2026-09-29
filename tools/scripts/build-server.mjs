/** Bundle the self-hosted server to a single dist-server/server.cjs (Node-side). */
import { build } from "esbuild";
import { mkdirSync, readFileSync } from "node:fs";

mkdirSync("dist-server", { recursive: true });
const version = JSON.parse(readFileSync("package.json", "utf8")).version ?? "0.0.0-dev";

/** Part-2 intermediate aliases (mirrors tsconfig paths). Part 3 replaces
 * these with npm workspace symlinks. */
const alias = {
  "@takenotes/contracts/errors": "./packages/contracts/src/errors.ts",
  "@takenotes/contracts/ipc": "./packages/contracts/src/contracts/ipc.ts",
  "@takenotes/contracts/protocol-version": "./packages/contracts/src/protocol-version.ts",
  "@takenotes/core/policy/note-policy": "./packages/core/src/policy/note-policy.ts",
  "@takenotes/core/ports/host-filesystem": "./packages/core/src/ports/host-filesystem.ts",
  "@takenotes/core/services/note-service": "./packages/core/src/services/note-service.ts",
  "@takenotes/core/validation/schemas": "./packages/core/src/validation/schemas.ts",
  "@takenotes/platform/types": "./packages/platform/src/types.ts",
};

await build({
  entryPoints: ["apps/server/src/main.ts"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  outfile: "dist-server/server.cjs",
  alias,
  sourcemap: false,
  logLevel: "info",
  define: { __TAKENOTES_VERSION__: JSON.stringify(version) },
});

console.log("takenotes server built: dist-server/server.cjs");
