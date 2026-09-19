import { useState, type JSX } from "react";
import type { Settings } from "./types";
import { Icon } from "./icons";
import horizontalDarkUrl from "../assets/brand/takenotes-horizontal-dark.svg";
import horizontalLightUrl from "../assets/brand/takenotes-horizontal-light.svg";
import type { PlatformState } from "../hooks/use-platform";
import type { CommandId } from "../../shared/commands/registry";

const TABS = ["General", "Appearance", "Editor", "Files", "Shortcuts", "About"] as const;

export function SettingsDialog({
  settings,
  onChange,
  version,
  platform,
  updatesEnabled,
  onCheckUpdates,
  onClose,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  version: string;
  platform: PlatformState;
  updatesEnabled: boolean;
  onCheckUpdates: () => void;
  onClose: () => void;
}): JSX.Element {
  const [tab, setTab] = useState<(typeof TABS)[number]>("General");
  const set = <K extends keyof Settings>(k: K, v: Settings[K]): void => onChange({ ...settings, [k]: v });
  return (
    <div className="dialog-wrap" onMouseDown={onClose}>
      <div className="dialog" role="dialog" aria-label="Settings" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <span style={{ flex: 1 }}>Settings</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close settings"><Icon name="x" /></button>
        </div>
        <div className="dialog-body">
          <nav className="dialog-nav" aria-label="Settings sections">
            {TABS.map((t) => (
              <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)} aria-current={tab === t}>{t}</button>
            ))}
          </nav>
          <div className="dialog-content">
            {tab === "General" && (
              <>
                <Row title="Confirm before moving to trash" desc="Ask first when deleting notes.">
                  <input type="checkbox" checked={settings.confirmTrash} aria-label="Confirm before moving to trash" onChange={(e) => set("confirmTrash", e.target.checked)} />
                </Row>
              </>
            )}
            {tab === "Appearance" && (
              <>
                <Row title="Theme" desc="Follow system, or pick light / dark.">
                  <select value={settings.theme} aria-label="Theme" onChange={(e) => set("theme", e.target.value as Settings["theme"])}>
                    <option value="system">System</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </Row>
              </>
            )}
            {tab === "Editor" && (
              <>
                <Row title="Font size" desc="13–20px. Default 16px.">
                  <select value={settings.fontSize} aria-label="Font size" onChange={(e) => set("fontSize", Number(e.target.value))}>
                    {[13, 14, 15, 16, 17, 18, 20].map((n) => <option key={n} value={n}>{n}px</option>)}
                  </select>
                </Row>
                <Row title="Readable line width" desc="Centered column for prose.">
                  <select value={settings.readableWidth} aria-label="Readable line width" onChange={(e) => set("readableWidth", Number(e.target.value))}>
                    {[640, 720, 760, 820, 900].map((n) => <option key={n} value={n}>{n}px</option>)}
                  </select>
                </Row>
                <Row title="Full width" desc="Use the whole editor for tables and code.">
                  <input type="checkbox" checked={settings.fullWidth} aria-label="Full width editor" onChange={(e) => set("fullWidth", e.target.checked)} />
                </Row>
                <Row title="Word wrap" desc="Wrap long lines in the editor.">
                  <input type="checkbox" checked={settings.wordWrap} aria-label="Word wrap" onChange={(e) => set("wordWrap", e.target.checked)} />
                </Row>
                <Row title="Line numbers" desc="Show gutter line numbers.">
                  <input type="checkbox" checked={settings.lineNumbers} aria-label="Line numbers" onChange={(e) => set("lineNumbers", e.target.checked)} />
                </Row>
              </>
            )}
            {tab === "Files" && (
              <Row title="Search exclusions" desc="Always skipped: .git, node_modules, dist, build, coverage.">
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>.git · node_modules · dist</span>
              </Row>
            )}
            {tab === "Shortcuts" && <ShortcutTable platform={platform} />}
            {tab === "About" && (
              <>
                <div className="about-brand">
                  <img src={horizontalDarkUrl} className="only-dark" alt="takenotes" draggable={false} />
                  <img src={horizontalLightUrl} className="only-light" alt="takenotes" draggable={false} />
                </div>
                <Row title="takenotes" desc={`Version ${version}. Filesystem-native Markdown notebook.`}><span /></Row>
                <Row
                  title="Software update"
                  desc={updatesEnabled ? "Stable releases only. Installer is checksum-verified." : "Available on Windows in this version."}
                >
                  <button className="btn" disabled={!updatesEnabled} onClick={onCheckUpdates}>Check for updates</button>
                </Row>
                <Row title="Source" desc="Local-first. Your files stay where they are."><span /></Row>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="setting-row">
      <span className="desc">{title}<small>{desc}</small></span>
      {children}
    </div>
  );
}

/** Shortcut reference rendered from the platform registry (§117). */
export function ShortcutTable({ platform }: { platform: PlatformState }): JSX.Element {
  const rows: [CommandId | "escape", string][] = [
    ["note.new", "New note"], ["quickOpen.open", "Quick open"], ["palette.open", "Commands"],
    ["editor.save", "Save"], ["note.close", "Close tab"], ["view.nextTab", "Next tab"],
    ["view.prevTab", "Previous tab"], ["view.toggleSidebar", "Toggle sidebar"], ["view.toggleFocus", "Focus mode"],
    ["settings.open", "Settings"], ["tree.rename", "Rename"], ["tree.trash", "Trash"], ["escape", "Close transient"],
  ];
  return (
    <table className="kbd-table"><tbody>
      {rows.map(([id, title]) => {
        const label = id === "escape" ? "Esc" : platform.shortcutLabel(id);
        return <tr key={id}><td>{title}</td><td style={{ textAlign: "right" }}>{label ? <kbd className="k">{label}</kbd> : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>menu only</span>}</td></tr>;
      })}
    </tbody></table>
  );
}
