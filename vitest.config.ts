import { defineConfig } from "vitest/config";
import { takenotesAliases } from "./tools-aliases";

export default defineConfig({
  resolve: {
    alias: takenotesAliases,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
  },
});
