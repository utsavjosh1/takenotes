/**
 * M3 — Appearance settings (pure + tiny store).
 *
 * Light/dark/system via core `resolveTheme` + tokens; type never invents
 * color. `fontScale` clamps to [0.85, 1.3] (a11y baseline: scalable
 * typography without breaking the 44pt touch floor — callers multiply
 * `fontSize.*`, never `targetSize.*`). Zoom level maps to the same scale
 * in V1 (one knob, not two).
 *
 * Persistence is an injected `{ get, set }` KV (AsyncStorage binding on
 * device, memory in tests). Corrupt stored JSON → defaults, never a crash.
 */

import type { ThemePreference } from "@takenotes/ui/theme";

export type AppearanceSettings = {
  theme: ThemePreference;
  fontScale: number;
};

export const DEFAULT_APPEARANCE: AppearanceSettings = { theme: "system", fontScale: 1 };

export const MIN_FONT_SCALE = 0.85;
export const MAX_FONT_SCALE = 1.3;

export const APPEARANCE_KEY = "takenotes.appearance.v1";

function clampScale(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, n));
}

function parseTheme(raw: unknown): ThemePreference {
  return raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
}

/** Total: unknown JSON → valid settings (never throws). */
export function parseAppearance(raw: unknown): AppearanceSettings {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_APPEARANCE };
  const r = raw as Record<string, unknown>;
  return {
    theme: parseTheme(r["theme"]),
    fontScale: typeof r["fontScale"] === "number" ? clampScale(r["fontScale"]) : 1,
  };
}

/** Scale a `fontSize` token. Touch targets are never scaled (see module doc). */
export function scaledFont(basePx: number, scale: number): number {
  return Math.round(basePx * clampScale(scale) * 2) / 2;
}

export type SettingsKv = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
};

export class AppearanceStore {
  constructor(
    private readonly kv: SettingsKv,
    private readonly key = APPEARANCE_KEY,
  ) {}

  async load(): Promise<AppearanceSettings> {
    let raw: string | null;
    try {
      raw = await this.kv.get(this.key);
    } catch {
      return { ...DEFAULT_APPEARANCE };
    }
    if (!raw) return { ...DEFAULT_APPEARANCE };
    try {
      return parseAppearance(JSON.parse(raw) as unknown);
    } catch {
      return { ...DEFAULT_APPEARANCE };
    }
  }

  async save(settings: AppearanceSettings): Promise<void> {
    await this.kv.set(this.key, JSON.stringify(parseAppearance(settings)));
  }
}
