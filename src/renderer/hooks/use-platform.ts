/**
 * Controlled platform state for the renderer (§10).
 * The OS is reported once by the main process via `app:platform` — the
 * renderer never sniffs `navigator.platform` / user-agent strings.
 */
import { useEffect, useState } from "react";
import type { PlatformReport } from "../../shared/contracts/ipc";
import type { DesktopPlatform } from "../../shared/platform/types";
import { getCapabilities, type PlatformCapabilities } from "../../shared/platform/capabilities";
import { formatShortcut, type CommandId } from "../../shared/platform";

export type PlatformState = {
  platform: DesktopPlatform;
  capabilities: PlatformCapabilities;
  /** Canonical `/`-separated relative-path join for the wire format. */
  shortcuts: Record<string, string>;
  wayland: boolean;
  ready: boolean;
  shortcutLabel(id: CommandId): string;
};

const FALLBACK: PlatformState = {
  platform: "windows",
  capabilities: getCapabilities("windows"),
  shortcuts: {},
  wayland: false,
  ready: false,
  shortcutLabel: () => "",
};

export function usePlatform(): PlatformState {
  const [state, setState] = useState<PlatformState>(FALLBACK);

  useEffect(() => {
    let cancelled = false;
    void window.takenotes.app.platform().then((res) => {
      if (cancelled || !res.ok) return;
      const report: PlatformReport = res.result;
      const platform = report.platform;
      setState({
        platform,
        capabilities: getCapabilities(platform),
        shortcuts: report.shortcuts,
        wayland: report.wayland,
        ready: true,
        shortcutLabel: (id: CommandId) => report.shortcuts[id] ?? formatShortcut(id, platform),
      });
      document.documentElement.dataset["platform"] = platform;
    });
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
