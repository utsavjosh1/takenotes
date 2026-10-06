/**
 * Step 2 hotkey store (renderer).
 * Logical file: app-data/hotkeys.json (`{[commandId]: string[]}`).
 * Persisted in localStorage (`takenotes.hotkeys`) with the identical shape
 * so migration to a main-side file is a straight copy.
 */
import { useCallback, useMemo, useState } from "react";
import { COMMAND_DEFINITIONS, commandDefinition, type CommandId } from "@takenotes/core/commands/registry";
import {
  acceleratorsForCommand,
  findOverrideCollisions,
  parseHotkeyOverrides,
  primaryAccelerator,
  type HotkeyOverrides,
} from "@takenotes/platform";
import { formatAccelerator } from "@takenotes/platform";
import type { DesktopPlatform } from "@takenotes/platform/types";

const STORAGE_KEY = "takenotes.hotkeys";
const VALID_IDS = COMMAND_DEFINITIONS.map((c) => c.id);

function load(): HotkeyOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const { overrides } = parseHotkeyOverrides(JSON.parse(raw), VALID_IDS);
    return overrides;
  } catch {
    return {};
  }
}

export type HotkeysApi = {
  overrides: HotkeyOverrides;
  errors: string[];
  collisions: { accelerator: string; commands: CommandId[] }[];
  acceleratorsFor: (id: CommandId) => string[];
  labelFor: (id: CommandId) => string;
  assign: (id: CommandId, accelerator: string) => void;
  clear: (id: CommandId) => void;
  resetAll: () => void;
};

export function useHotkeys(platform: DesktopPlatform): HotkeysApi {
  const [overrides, setOverrides] = useState<HotkeyOverrides>(load);

  const persist = useCallback((next: HotkeyOverrides) => {
    setOverrides(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage full/blocked — overrides stay in memory */
    }
  }, []);

  const { errors } = useMemo(
    () => parseHotkeyOverrides(overrides, VALID_IDS),
    [overrides],
  );

  const collisions = useMemo(() => {
    const resolved: Partial<Record<CommandId, string[]>> = {};
    for (const def of COMMAND_DEFINITIONS) {
      resolved[def.id] = acceleratorsForCommand(def.id, platform, overrides);
    }
    return findOverrideCollisions(resolved, (id) => {
      try {
        return commandDefinition(id).scope;
      } catch {
        return "application";
      }
    });
  }, [overrides, platform]);

  const acceleratorsFor = useCallback(
    (id: CommandId) => acceleratorsForCommand(id, platform, overrides),
    [platform, overrides],
  );

  const labelFor = useCallback(
    (id: CommandId) => {
      const primary = primaryAccelerator(id, platform, overrides);
      return primary ? formatAccelerator(primary, platform) : "";
    },
    [platform, overrides],
  );

  const assign = useCallback(
    (id: CommandId, accelerator: string) => {
      const acc = accelerator.trim();
      if (!acc) return;
      persist({ ...overrides, [id]: [acc] });
    },
    [overrides, persist],
  );

  const clear = useCallback(
    (id: CommandId) => persist({ ...overrides, [id]: [] }),
    [overrides, persist],
  );

  const resetAll = useCallback(() => persist({}), [persist]);

  return { overrides, errors, collisions, acceleratorsFor, labelFor, assign, clear, resetAll };
}

/** Serialize a KeyboardEvent into Electron accelerator syntax for assign-capture. */
export function acceleratorFromKeyboardEvent(e: KeyboardEvent): string | null {
  if (e.key === "Control" || e.key === "Meta" || e.key === "Shift" || e.key === "Alt") return null;
  const key = e.key === " " ? "Space" : e.key.length === 1 ? e.key.toUpperCase() : e.key;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("CommandOrControl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}
