import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: "src/renderer",
  base: "./",
  // Brand SVGs live in repo-root `public/` (canonical export source).
  // Copied to dist/renderer/ on build; served at server root in dev.
  publicDir: "../../public",
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
