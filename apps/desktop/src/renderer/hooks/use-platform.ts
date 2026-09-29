/**
 * Controlled platform state for the renderer (§10).
 * The OS is reported once by the main process via `app:platform` — the
 * renderer never sniffs `navigator.platform` / user-agent strings.
 */
import { useEffect, useState } from "react";
import type { PlatformReport } from "@takenotes/contracts/ipc";
import type { DesktopPlatform } from "@takenotes/platform/types";
import { getCapabilities, type PlatformCapabilities } from "@takenotes/platform/capabilities";
import { formatShortcut, type CommandId } from "@takenotes/platform";
import { getBridge } from "../bridge";

export type PlatformState = {
  platform: DesktopPlatform;
  capabilities: PlatformCapabilities;
  /** Canonical `/`-separated relative-path join for the wire format. */
  shortcuts: Record<string, string>;
  wayland: boolean;
  ready: boolean;
  /** True when `window.takenotes` is absent (renderer in a plain browser). */
  bridgeMissing: boolean;
  shortcutLabel(id: CommandId): string;
};

const FALLBACK: PlatformState = {
  platform: "windows",
  capabilities: getCapabilities("windows"),
  shortcuts: {},
  wayland: false,
  ready: false,
  bridgeMissing: false,
  shortcutLabel: () => "",
};

export function usePlatform(): PlatformState {
  const [state, setState] = useState<PlatformState>(FALLBACK);

  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) {
      // Renderer running outside Electron (browser / preload failed): never
      // throw — fall back to defaults and flag it for the shell banner.
      console.warn("[renderer] desktop bridge unavailable (window.takenotes is undefined). This is expected in a plain browser tab — use the Electron window from `npm run dev`, not the vite URL.");
      setState((p) => ({ ...p, bridgeMissing: true }));
      return;
    }
    let cancelled = false;
    void bridge.app.platform().then((res) => {
      if (cancelled || !res.ok) return;
      const report: PlatformReport = res.result;
      const platform = report.platform;
      setState({
        platform,
        capabilities: getCapabilities(platform),
        shortcuts: report.shortcuts,
        wayland: report.wayland,
        ready: true,
        bridgeMissing: false,
        shortcutLabel: (id: CommandId) => report.shortcuts[id] ?? formatShortcut(id, platform),
      });
      document.documentElement.dataset["platform"] = platform;
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/** Labels that fall back to the shared formatter before IPC resolves. */
export function staticShortcutLabel(id: CommandId, platform: DesktopPlatform): string {
  return formatShortcut(id, platform);
}
