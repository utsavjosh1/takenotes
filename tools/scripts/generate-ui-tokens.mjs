import { readFileSync, writeFileSync } from "node:fs";
import { colors, space, radius, fontSize, lineHeight, targetSize } from "../../packages/ui/src/theme.ts";

const lines = ["/* Generated from src/theme.ts. Run npm run ui:tokens; do not edit by hand. */", "", ":root {"];
for (const [prefix, values, unit] of [
  ["space", space, "px"], ["radius", radius, "px"], ["font-size", fontSize, "rem"],
  ["line-height", lineHeight, ""], ["target", targetSize, "px"],
]) {
  for (const [name, value] of Object.entries(values)) {
    lines.push(`  --tn-${prefix}-${name}: ${unit === "rem" ? value / 16 : value}${unit};`);
  }
}
lines.push("}", "");
for (const [theme, values] of Object.entries(colors)) {
  lines.push(theme === "light" ? ':root, [data-theme="light"] {' : '[data-theme="dark"] {', `  color-scheme: ${theme};`);
  for (const [name, value] of Object.entries(values)) lines.push(`  --tn-${name}: ${value};`);
  lines.push("}", "");
}
const css = lines.join("\n");
const target = new URL("../../packages/ui/src/tokens.css", import.meta.url);
if (process.argv.includes("--check")) {
  if (readFileSync(target, "utf8") !== css) throw new Error("UI tokens are stale. Run npm run ui:tokens.");
} else {
  writeFileSync(target, css);
}
