import { create } from "zustand";
import { DEFAULT_SETTINGS, type Settings } from "../components/types";
import { parseSettings } from "@takenotes/core/validation/schemas";

const STORAGE_KEY = "takenotes.settings";

function load(): Settings {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    // Stored settings are untrusted input (user-editable localStorage):
    // invalid fields fall back to defaults instead of breaking boot.
    return { ...DEFAULT_SETTINGS, ...parseSettings(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

type SettingsStore = {
  settings: Settings;
  setAll: (s: Settings) => void;
  set: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
};

/** App settings. Persistence + theme application stay in `App`'s effect
 * (DOM side-effects don't belong in the store); every writer goes through
 * here so the shape is validated once at load. */
export const useSettingsStore = create<SettingsStore>()((set) => ({
  settings: load(),
  setAll: (settings) => set({ settings }),
  set: (k, v) => set((s) => ({ settings: { ...s.settings, [k]: v } })),
}));
