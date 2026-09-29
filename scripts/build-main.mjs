/** Build Electron main + preload with esbuild (no framework magic). */
import { build } from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync("dist-electron/main", { recursive: true });
mkdirSync("dist-electron/preload", { recursive: true });

/** Part-1 intermediate aliases (mirrors tsconfig paths): `@takenotes/*`
 * resolves to the pre-split `src/**` locations. Part 2 replaces these
 * with real workspace packages (node_modules symlinks). */
const alias = {
  "@takenotes/contracts/ipc": "./src/shared/contracts/ipc.ts",
  "@takenotes/contracts/errors": "./src/shared/errors.ts",
  "@takenotes/contracts/protocol": "./src/shared/protocol.ts",
  "@takenotes/contracts/protocol-version": "./src/shared/protocol-version.ts",
  "@takenotes/core/commands/registry": "./src/shared/commands/registry.ts",
  "@takenotes/core/commands/palette": "./src/shared/commands/palette.ts",
  "@takenotes/core/commands/hotkeys": "./src/shared/commands/hotkeys.ts",
  "@takenotes/core/index/store": "./src/shared/index/store.ts",
  "@takenotes/core/index/document": "./src/shared/index/document.ts",
  "@takenotes/core/index/properties": "./src/shared/index/properties.ts",
  "@takenotes/core/policy/note-policy": "./src/core/policy/note-policy.ts",
  "@takenotes/core/ports/host-filesystem": "./src/core/ports/host-filesystem.ts",
  "@takenotes/core/productivity/daily": "./src/shared/productivity/daily.ts",
  "@takenotes/core/services/note-service": "./src/core/services/note-service.ts",
  "@takenotes/core/search/query": "./src/shared/search/query.ts",
  "@takenotes/core/search/search": "./src/shared/search/search.ts",
  "@takenotes/platform": "./src/shared/platform/index.ts",
  "@takenotes/platform/capabilities": "./src/shared/platform/capabilities.ts",
  "@takenotes/platform/filesystem": "./src/shared/platform/filesystem.ts",
  "@takenotes/platform/keymap": "./src/shared/platform/keymap.ts",
  "@takenotes/platform/platform": "./src/shared/platform/platform.ts",
  "@takenotes/platform/shortcut-labels": "./src/shared/platform/shortcut-labels.ts",
  "@takenotes/platform/types": "./src/shared/platform/types.ts",
  "@takenotes/platform/window": "./src/shared/platform/window.ts",
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
