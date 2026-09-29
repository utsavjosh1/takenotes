/** Build Electron main + preload with esbuild (no framework magic). */
import { build } from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync("dist-electron/main", { recursive: true });
mkdirSync("dist-electron/preload", { recursive: true });

/** Part-2 intermediate aliases (mirrors tsconfig paths): `@takenotes/*`
 * resolves to the real `packages/*` locations. Part 3 replaces these
 * with npm workspace symlinks. */
const alias = {
  "@takenotes/contracts/ipc": "./packages/contracts/src/contracts/ipc.ts",
  "@takenotes/contracts/errors": "./packages/contracts/src/errors.ts",
  "@takenotes/contracts/protocol": "./packages/contracts/src/protocol.ts",
  "@takenotes/contracts/protocol-version": "./packages/contracts/src/protocol-version.ts",
  "@takenotes/core/commands/registry": "./packages/core/src/commands/registry.ts",
  "@takenotes/core/commands/palette": "./packages/core/src/commands/palette.ts",
  "@takenotes/core/commands/hotkeys": "./packages/core/src/commands/hotkeys.ts",
  "@takenotes/core/index/store": "./packages/core/src/index/store.ts",
  "@takenotes/core/index/document": "./packages/core/src/index/document.ts",
  "@takenotes/core/index/properties": "./packages/core/src/index/properties.ts",
  "@takenotes/core/policy/note-policy": "./packages/core/src/policy/note-policy.ts",
  "@takenotes/core/ports/host-filesystem": "./packages/core/src/ports/host-filesystem.ts",
  "@takenotes/core/productivity/daily": "./packages/core/src/productivity/daily.ts",
  "@takenotes/core/services/note-service": "./packages/core/src/services/note-service.ts",
  "@takenotes/core/search/query": "./packages/core/src/search/query.ts",
  "@takenotes/core/search/search": "./packages/core/src/search/search.ts",
  "@takenotes/core/validation/schemas": "./packages/core/src/validation/schemas.ts",
  "@takenotes/platform": "./packages/platform/src/index.ts",
  "@takenotes/platform/capabilities": "./packages/platform/src/capabilities.ts",
  "@takenotes/platform/filesystem": "./packages/platform/src/filesystem.ts",
  "@takenotes/platform/keymap": "./packages/platform/src/keymap.ts",
  "@takenotes/platform/platform": "./packages/platform/src/platform.ts",
  "@takenotes/platform/shortcut-labels": "./packages/platform/src/shortcut-labels.ts",
  "@takenotes/platform/types": "./packages/platform/src/types.ts",
  "@takenotes/platform/window": "./packages/platform/src/window.ts",
  "@takenotes/ui": "./packages/ui/src/index.ts",
  "@takenotes/ui/dom": "./packages/ui/src/dom/index.ts",
};

await build({
  entryPoints: ["apps/desktop/src/main/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist-electron/main/index.cjs",
  external: ["electron"],
  alias,
  sourcemap: false,
  logLevel: "info",
});

await build({
  entryPoints: ["apps/desktop/src/preload/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist-electron/preload/index.cjs",
  external: ["electron"],
  alias,
  sourcemap: false,
  logLevel: "info",
});

console.log("Electron main + preload built.");
