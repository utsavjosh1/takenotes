import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const join = (...parts: string[]) => path.join(root, ...parts);

/** Part-1 intermediate aliases: `@takenotes/*` resolves to the pre-split
 * `src/**` locations (plus `packages/ui`, pulled forward). Part 2 replaces
 * these with real workspace packages. Exact file matches come first so
 * directory prefixes never shadow them. */
export const takenotesAliases: Array<{ find: RegExp; replacement: string }> = [
  // Exact file aliases.
  { find: /^@takenotes\/contracts\/ipc$/, replacement: join("src/shared/contracts/ipc.ts") },
  { find: /^@takenotes\/contracts\/errors$/, replacement: join("src/shared/errors.ts") },
  { find: /^@takenotes\/contracts\/protocol$/, replacement: join("src/shared/protocol.ts") },
  { find: /^@takenotes\/contracts\/protocol-version$/, replacement: join("src/shared/protocol-version.ts") },
  { find: /^@takenotes\/core\/index\/store$/, replacement: join("src/shared/index/store.ts") },
  { find: /^@takenotes\/core\/index\/document$/, replacement: join("src/shared/index/document.ts") },
  { find: /^@takenotes\/core\/index\/properties$/, replacement: join("src/shared/index/properties.ts") },
  { find: /^@takenotes\/platform$/, replacement: join("src/shared/platform/index.ts") },
  { find: /^@takenotes\/ui$/, replacement: join("packages/ui/src/index.ts") },
  { find: /^@takenotes\/ui\/dom\.css$/, replacement: join("packages/ui/src/dom/styles.css") },
  { find: /^@takenotes\/ui\/tokens\.css$/, replacement: join("packages/ui/src/tokens.css") },
  // Directory prefixes (remainder of the import path is preserved).
  { find: /^@takenotes\/core\/commands\//, replacement: join("src/shared/commands/") },
  { find: /^@takenotes\/core\/index\//, replacement: join("src/shared/index/") },
  { find: /^@takenotes\/core\/policy\//, replacement: join("src/core/policy/") },
  { find: /^@takenotes\/core\/ports\//, replacement: join("src/core/ports/") },
  { find: /^@takenotes\/core\/productivity\//, replacement: join("src/shared/productivity/") },
  { find: /^@takenotes\/core\/search\//, replacement: join("src/shared/search/") },
  { find: /^@takenotes\/core\/services\//, replacement: join("src/core/services/") },
  { find: /^@takenotes\/platform\//, replacement: join("src/shared/platform/") },
  { find: /^@takenotes\/ui\//, replacement: join("packages/ui/src/") },
  { find: /^@takenotes\/desktop\//, replacement: join("apps/desktop/src/") },
];
