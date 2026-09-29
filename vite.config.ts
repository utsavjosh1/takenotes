import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { takenotesAliases } from "./tools-aliases";

export default defineConfig({
  plugins: [react()],
  root: "apps/desktop/src/renderer",
  base: "./",
  resolve: {
    alias: takenotesAliases,
  },
  // Brand SVGs live in repo-root `public/` (canonical export source).
  // Copied to dist/renderer/ on build; served at server root in dev.
  publicDir: "../../../../public",
  build: {
    outDir: "../../../../dist/renderer",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
