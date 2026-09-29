import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const join = (...parts: string[]) => path.join(root, ...parts);

/** Part-2 intermediate aliases: `@takenotes/*` resolves to the real
 * `apps/*`, `packages/*`, `tools/*` locations. Part 3 replaces these
 * with npm workspace symlinks (per-package manifests + root workspaces).
 * Exact file matches come first so directory prefixes never shadow them. */
export const takenotesAliases: Array<{ find: RegExp; replacement: string }> = [
  // Exact file aliases.
  { find: /^@takenotes\/contracts\/ipc$/, replacement: join("packages/contracts/src/contracts/ipc.ts") },
  { find: /^@takenotes\/contracts\/errors$/, replacement: join("packages/contracts/src/errors.ts") },
  { find: /^@takenotes\/contracts\/protocol$/, replacement: join("packages/contracts/src/protocol.ts") },
  { find: /^@takenotes\/contracts\/protocol-version$/, replacement: join("packages/contracts/src/protocol-version.ts") },
  { find: /^@takenotes\/platform$/, replacement: join("packages/platform/src/index.ts") },
  { find: /^@takenotes\/ui$/, replacement: join("packages/ui/src/index.ts") },
  { find: /^@takenotes\/ui\/dom\.css$/, replacement: join("packages/ui/src/dom/styles.css") },
  { find: /^@takenotes\/ui\/tokens\.css$/, replacement: join("packages/ui/src/tokens.css") },
  // Directory prefixes (remainder of the import path is preserved).
  { find: /^@takenotes\/core\//, replacement: join("packages/core/src/") },
  { find: /^@takenotes\/contracts\//, replacement: join("packages/contracts/src/") },
  { find: /^@takenotes\/platform\//, replacement: join("packages/platform/src/") },
  { find: /^@takenotes\/ui\//, replacement: join("packages/ui/src/") },
  { find: /^@takenotes\/desktop\//, replacement: join("apps/desktop/src/") },
  { find: /^@takenotes\/server\//, replacement: join("apps/server/src/") },
  { find: /^@takenotes\/wsl-helper\//, replacement: join("tools/wsl-helper/src/") },
];
