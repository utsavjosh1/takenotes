/* Adapter over the shared icon set (@takenotes/ui): 20px, 1.5px stroke, round
 * caps, currentColor. Desktop keeps its own names; this maps them. */
import type { JSX } from "react";
import { Icon as SharedIcon, type IconName as SharedName } from "@takenotes/ui/dom";

const names = {
  files: "file", search: "search", settings: "gear", file: "file", folder: "folder", chevronRight: "chevR", chevronDown: "chevD",
  x: "x", plus: "plus", more: "dots", terminal: "terminal", list: "list", calendar: "calendar", grid: "grid", command: "command",
  tag: "tag", sliders: "sliders", table: "table", alert: "warn", tasks: "tasks", panel: "split", star: "star", info: "info",
  cloud: "cloud", check: "check", bolt: "bolt", lock: "lock", sort: "sort", folderPlus: "folderPlus", clock: "today",
  keyboard: "keyboard", graph: "graph",
} as const satisfies Record<string, SharedName>;

export type IconName = keyof typeof names;

export function Icon({ name, className }: { name: IconName; className?: string }): JSX.Element {
  return <SharedIcon name={names[name]} {...(className ? { className } : {})} />;
}
