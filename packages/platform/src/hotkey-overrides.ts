/**
 * Step 2 hotkey overrides (pure, testable).
 *
 * Logical file: app-data/hotkeys.json, shape `{[commandId]: string[]}`.
 * Empty/missing = defaults from keymap.ts. An explicit empty array unbinds.
 * Multiple entries per command are allowed; the first is primary (menus).
 * No Ctrl+E / Ctrl+T defaults exist (ADR-0015, Step 2 lock).
 */
import type { CommandId } from "./keymap.js";
import { COMMANDS, acceleratorFor, normalizeAccelerator } from "./keymap.js";
import type { DesktopPlatform } from "./types.js";

export type KeyEventLike = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

export type HotkeyOverrides = Partial<Record<CommandId, string[]>>;

export function parseHotkeyOverrides(
  raw: unknown,
  validIds: readonly string[],
): { overrides: HotkeyOverrides; errors: string[] } {
  const overrides: HotkeyOverrides = {};
  const errors: string[] = [];
  if (raw === null || raw === undefined) return { overrides, errors };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { overrides, errors: ["hotkeys must be an object"] };
  }
  const valid = new Set(validIds);
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!valid.has(key)) {
      errors.push(`unknown command: ${key}`);
      continue;
    }
    if (!Array.isArray(value)) {
      errors.push(`${key}: expected string array`);
      continue;
    }
    const accs: string[] = [];
    for (const v of value) {
      if (typeof v !== "string" || !v.trim()) {
        errors.push(`${key}: skipped empty binding`);
        continue;
      }
      accs.push(v.trim());
    }
    overrides[key as CommandId] = accs;
  }
  return { overrides, errors };
}

/** Resolved accelerators: override (even empty = unbound) else single default. */
export function acceleratorsForCommand(
  id: CommandId,
  platform: DesktopPlatform,
  overrides: HotkeyOverrides,
): string[] {
  if (id in overrides) return [...(overrides[id] ?? [])];
  const def = acceleratorFor(id, platform);
  return def ? [def] : [];
}

export function primaryAccelerator(
  id: CommandId,
  platform: DesktopPlatform,
  overrides: HotkeyOverrides,
): string | undefined {
  return acceleratorsForCommand(id, platform, overrides)[0];
}

function keyEventToAccelerator(event: KeyEventLike): string | null {
  const key = event.key === " " ? "Space" : event.key.length === 1 ? event.key.toUpperCase() : event.key;
  if (!key || ["Control", "Meta", "Shift", "Alt"].includes(key)) return null;
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("CommandOrControl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

/** Multi-binding aware matcher: overrides first, then keymap defaults. */
export function commandForKeyEventWithOverrides(
  platform: DesktopPlatform,
  event: KeyEventLike,
  overrides: HotkeyOverrides,
): CommandId | null {
  const raw = keyEventToAccelerator(event);
  if (!raw) return null;
  const normalized = normalizeAccelerator(raw);
  for (const [id, accs] of Object.entries(overrides) as [CommandId, string[]][]) {
    // Skip native-role commands (quit/fullscreen use OS roles, §57).
    if (COMMANDS.find((c) => c.id === id)?.nativeRole) continue;
    for (const acc of accs) {
      if (normalizeAccelerator(acc) === normalized) return id;
    }
  }
  for (const command of COMMANDS) {
    if (command.nativeRole) continue;
    if (command.id in overrides) continue; // overridden (incl. unbound) — defaults don't apply
    const acc = acceleratorFor(command.id, platform);
    if (acc && normalizeAccelerator(acc) === normalized) return command.id;
  }
  return null;
}

export type OverrideCollision = {
  accelerator: string;
  commands: CommandId[];
};

/** Same-normalized-accelerator collisions across the resolved set.
 * Scope-agnostic by design: the matcher above ignores scope, so an
 * override in one scope that shadows another command's default would
 * otherwise silence that command with no warning. */
export function findOverrideCollisions(
  resolved: Partial<Record<CommandId, string[]>>,
  _scopeFor: (id: CommandId) => string,
): OverrideCollision[] {
  const byKey = new Map<string, CommandId[]>();
  for (const [id, accs] of Object.entries(resolved) as [CommandId, string[]][]) {
    for (const acc of accs ?? []) {
      const key = normalizeAccelerator(acc);
      byKey.set(key, [...(byKey.get(key) ?? []), id]);
    }
  }
  const out: OverrideCollision[] = [];
  for (const [key, ids] of byKey) {
    if (ids.length > 1) out.push({ accelerator: key, commands: [...new Set(ids)] });
  }
  return out;
}
