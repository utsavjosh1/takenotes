// Resolves the person's theme setting (light / dark / system) and text size
// once, and hands every component the same palette as the web tokens.
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { palette, scaledFont, type Palette } from "@takenotes/ui/native";
import { resolveTheme, type Theme } from "@takenotes/ui/native";
import type { AppearanceSettings } from "../src/settings/appearance";

export type ThemeValue = { theme: Theme; p: Palette; font: (base: number) => number };

const DEFAULT: AppearanceSettings = { theme: "system", fontScale: 1 };
const Ctx = createContext<AppearanceSettings>(DEFAULT);

export function AppearanceProvider({ value, children }: { value: AppearanceSettings; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeValue {
  const appearance = useContext(Ctx);
  const system: Theme = useColorScheme() === "dark" ? "dark" : "light";
  const theme = resolveTheme(appearance.theme, system);
  return useMemo(() => ({ theme, p: palette(theme), font: (base: number) => scaledFont(base, appearance.fontScale) }), [theme, appearance.fontScale]);
}
