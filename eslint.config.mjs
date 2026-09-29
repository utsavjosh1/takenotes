import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist/**", "dist-electron/**", "dist-helper/**", "dist-server/**", "release/**", "coverage/**", "node_modules/**", "resources/wsl/linux-x64/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["apps/desktop/src/main/**/*.ts", "apps/desktop/src/preload/**/*.ts", "apps/server/**/*.ts", "tools/wsl-helper/**/*.ts", "tools/scripts/**/*.mjs", "scripts/**/*.mjs", "tests/**/*.ts", "tools-aliases.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ["apps/desktop/src/renderer/**/*.ts", "apps/desktop/src/renderer/**/*.tsx", "packages/ui/src/**/*.ts", "packages/ui/src/**/*.tsx", "public/**/*.js"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  // Defense in depth: shipped main/helper code must never gain network imports
  // by accident. Release-time scripts/ are intentionally excluded.
  {
    files: ["apps/desktop/src/main/**/*.ts", "apps/desktop/src/preload/**/*.ts", "tools/wsl-helper/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "node:http", message: "No network in shipped main/helper code." },
            { name: "node:https", message: "No network in shipped main/helper code." },
            { name: "node:net", message: "No network in shipped main/helper code." },
            { name: "node:tls", message: "No network in shipped main/helper code." },
            { name: "node:dgram", message: "No network in shipped main/helper code." },
          ],
        },
      ],
    },
  },
  // Last block wins: CLI scripts may log to stdout.
  {
    files: ["tools/scripts/**/*.mjs", "scripts/**/*.mjs"],
    rules: {
      "no-console": "off",
    },
  },
);
