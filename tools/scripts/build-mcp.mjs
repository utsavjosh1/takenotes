/** Bundle the MCP stdio sidecar to a single takenotes-mcp.cjs. */
import { build } from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync("dist-mcp", { recursive: true });

await build({
  entryPoints: ["tools/mcp-sidecar/src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  outfile: "dist-mcp/takenotes-mcp.cjs",
  // No shebang: clients run `node takenotes-mcp.cjs` (esbuild's
  // `"use strict"` prologue would push a banner to line 2, where node
  // rejects it).
  sourcemap: false,
  logLevel: "info",
});

console.log("MCP sidecar built: dist-mcp/takenotes-mcp.cjs");
