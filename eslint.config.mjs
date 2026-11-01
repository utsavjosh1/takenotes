import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { ignores: ["design/**", "new/**", ".agents/**", ".claude/**", "dist/**", "dist-electron/**", "dist-helper/**", "dist-server/**", "dist-mcp/**", "release/**", "coverage/**", "node_modules/**", "reference/**", "resources/wsl/linux-x64/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["apps/desktop/src/main/**/*.ts", "apps/desktop/src/preload/**/*.ts", "apps/server/**/*.ts", "tools/wsl-helper/**/*.ts", "tools/mcp-sidecar/**/*.ts", "tools/scripts/**/*.mjs", "tests/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ["apps/desktop/src/renderer/**/*.ts", "apps/desktop/src/renderer/**/*.tsx", "apps/web/src/**/*.ts", "apps/web/src/**/*.tsx", "packages/ui/src/**/*.ts", "packages/ui/src/**/*.tsx", "tests/ui/**/*.ts", "tests/ui/**/*.tsx", "public/**/*.js"],
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
  // One design system. No third-party UI kits or CSS-in-JS, and the shared
  // component names can only come from packages/ui, never be redefined in an app.
  {
    files: ["apps/**/*.ts", "apps/**/*.tsx", "packages/ui/src/**/*.ts", "packages/ui/src/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@mui/*", "@chakra-ui/*", "antd", "antd/*", "react-bootstrap", "@mantine/*", "@fluentui/*", "@blueprintjs/*", "semantic-ui-react"], message: "Use @takenotes/ui components." },
            { group: ["styled-components", "@emotion/*", "@stitches/*", "twin.macro"], message: "No CSS-in-JS. Use tokens and CSS files." },
            { group: ["lucide-react", "react-icons", "react-icons/*", "@heroicons/*", "@phosphor-icons/*", "@fortawesome/*"], message: "Use the shared Icon from @takenotes/ui." },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/**/*.tsx", "apps/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "FunctionDeclaration[id.name=/^(Button|IconButton|Input|Select|Textarea|Switch|Checkbox|Chip|Badge|Pill|Card|Dialog|ConfirmDialog|ErrorDialog|Menu|MenuItem|Popover|Tooltip|Toast|Banner|Notice|Tabs|Skeleton|Progress|Stepper|DataTable|CommandPalette|Rail)$/]",
          message: "This component lives in @takenotes/ui. Import it instead of defining another.",
        },
        {
          selector: "VariableDeclarator[id.name=/^(Button|IconButton|Input|Select|Textarea|Switch|Checkbox|Chip|Badge|Pill|Card|Dialog|ConfirmDialog|ErrorDialog|Menu|MenuItem|Popover|Tooltip|Toast|Banner|Notice|Tabs|Skeleton|Progress|Stepper|DataTable|CommandPalette|Rail)$/][init.type=/^(ArrowFunctionExpression|FunctionExpression)$/]",
          message: "This component lives in @takenotes/ui. Import it instead of defining another.",
        },
      ],
    },
  },
  // The native (React Native) layer is where mobile's shared components are implemented.
  { files: ["apps/mobile/components/**/*.tsx"], rules: { "no-restricted-syntax": "off" } },
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
  // MCP pipe transport (ADR-0012) is the one deliberate exception: the
  // sidecar reaches the running app over a private named pipe / unix
  // socket. `node:net` here is IPC only — `mcpSocketPath()` never yields
  // a TCP host/port, and `node:http(s)/tls/dgram` stay banned.
  {
    files: ["apps/desktop/src/main/services/mcp-pipe.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "node:http", message: "No network in shipped main/helper code." },
            { name: "node:https", message: "No network in shipped main/helper code." },
            { name: "node:tls", message: "No network in shipped main/helper code." },
            { name: "node:dgram", message: "No network in shipped main/helper code." },
          ],
        },
      ],
    },
  },
  // Last block wins: CLI scripts may log to stdout.
  {
    files: ["tools/scripts/**/*.mjs"],
    rules: {
      "no-console": "off",
    },
  },
);
