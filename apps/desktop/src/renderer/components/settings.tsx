import { useState, type JSX } from "react";
import { Button, Dialog, SettingRow } from "@takenotes/ui/dom";
import type { Settings } from "./types";
import type { HotkeysApi } from "../hooks/use-hotkeys";
import { acceleratorFromKeyboardEvent } from "../hooks/use-hotkeys";
import lockupDarkUrl from "../assets/brand/takenotes-lockup-dark.svg";
import lockupLightUrl from "../assets/brand/takenotes-lockup-light.svg";
import type { PlatformState } from "../hooks/use-platform";
import type { CommandId } from "@takenotes/core/commands/registry";

const TABS = ["General", "Appearance", "Editor", "Files", "Shortcuts", "About"] as const;

export function SettingsDialog({ settings, onChange, version, platform, hotkeys, updatesEnabled, onCheckUpdates, onClose }: {
  settings: Settings;
  onChange: (s: Settings) => void;
  version: string;
  platform: PlatformState;
  hotkeys?: HotkeysApi;
  updatesEnabled: boolean;
  onCheckUpdates: () => void;
  onClose: () => void;
}): JSX.Element {
  const [tab, setTab] = useState<(typeof TABS)[number]>("General");
  const set = <K extends keyof Settings>(k: K, v: Settings[K]): void => onChange({ ...settings, [k]: v });
  return (
    <Dialog title="Settings" size="wide" onClose={onClose} closeOnBackdrop>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {TABS.map((t) => <button key={t} className={tab === t ? "active" : ""}
            onClick={() => setTab(t)} aria-current={tab === t}>{t}</button>)}
        </nav>
        <div className="settings-content">
          {tab === "General" && (<>
            <SettingRow label="Confirm before moving to trash" description="Ask first when deleting notes.">
              {(control) => <input {...control} type="checkbox" checked={settings.confirmTrash} onChange={(e) => set("confirmTrash", e.target.checked)} />}
            </SettingRow>
            <SettingRow label="Show activity ribbon" description="Rail with Explorer, Search, Outline, Favorites. Off hides it; palette still switches panes.">
              {(control) => <input {...control} type="checkbox" checked={settings.ribbonVisible} onChange={(e) => set("ribbonVisible", e.target.checked)} />}
            </SettingRow>
            {platform.capabilities.wsl && (
              <SettingRow label="Enable WSL workspaces" description="Show WSL folder options. Off keeps a plain notetaking app.">
                {(control) => <input {...control} type="checkbox" checked={settings.wslEnabled} onChange={(e) => set("wslEnabled", e.target.checked)} />}
              </SettingRow>
            )}
          </>)}
          {tab === "Appearance" && (
            <SettingRow label="Theme" description="Follow system, or pick light / dark.">
              {(control) => <select {...control} value={settings.theme} onChange={(e) => set("theme", e.target.value as Settings["theme"])}>
                <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
              </select>}
            </SettingRow>
          )}
          {tab === "Editor" && <>
            <SettingRow label="Font size" description="13–20px. Default 16px.">
              {(control) => <select {...control} value={settings.fontSize} onChange={(e) => set("fontSize", Number(e.target.value))}>
                {[13, 14, 15, 16, 17, 18, 20].map((n) => <option key={n} value={n}>{n}px</option>)}
              </select>}
            </SettingRow>
            <SettingRow label="Readable line width" description="Centered column for prose.">
              {(control) => <select {...control} value={settings.readableWidth} onChange={(e) => set("readableWidth", Number(e.target.value))}>
                {[640, 720, 760, 820, 900].map((n) => <option key={n} value={n}>{n}px</option>)}
              </select>}
            </SettingRow>
            <SettingRow label="Full width" description="Use the whole editor for tables and code.">
              {(control) => <input {...control} type="checkbox" checked={settings.fullWidth} onChange={(e) => set("fullWidth", e.target.checked)} />}
            </SettingRow>
            <SettingRow label="Word wrap" description="Wrap long lines in the editor.">
              {(control) => <input {...control} type="checkbox" checked={settings.wordWrap} onChange={(e) => set("wordWrap", e.target.checked)} />}
            </SettingRow>
            <SettingRow label="Line numbers" description="Show gutter line numbers.">
              {(control) => <input {...control} type="checkbox" checked={settings.lineNumbers} onChange={(e) => set("lineNumbers", e.target.checked)} />}
            </SettingRow>
            <SettingRow label="Live preview" description="Render markdown in place; the cursor line shows raw source. Off shows plain source everywhere.">
              {(control) => <input {...control} type="checkbox" checked={settings.livePreview} onChange={(e) => set("livePreview", e.target.checked)} />}
            </SettingRow>
          </>}
          {tab === "Files" && <>
            <SettingRow label="Search exclusions" description="Always skipped: .git, node_modules, dist, build, coverage." />
            <SettingRow label="Link style" description="How [[ autocomplete writes new links. Shortest uses the bare note name.">
              {(control) => <select {...control} value={settings.linkFormat} onChange={(e) => set("linkFormat", e.target.value as Settings["linkFormat"])}>
                <option value="shortest">Shortest</option><option value="relative">Relative</option><option value="absolute">Absolute</option>
              </select>}
            </SettingRow>
            <SettingRow label="Template folder" description="Ordinary folder of .md templates, relative to the workspace root. Insert Template renders {{title}}, {{date}}, {{time}} only.">
              {(control) => <input {...control} type="text" value={settings.templateFolder} placeholder="Templates" onChange={(e) => set("templateFolder", e.target.value)} />}
            </SettingRow>
            <SettingRow label="Update links on rename" description="Rewrite [[links]] when a note or folder moves. Off asks first and renames only.">
              {(control) => <input {...control} type="checkbox" checked={settings.autoUpdateLinks} onChange={(e) => set("autoUpdateLinks", e.target.checked)} />}
            </SettingRow>
          </>}
          {tab === "Shortcuts" && <ShortcutTable platform={platform} hotkeys={hotkeys} />}
          {tab === "About" && <>
            <div className="about-brand">
              <img src={lockupDarkUrl} className="only-dark" alt="takenotes" draggable={false} />
              <img src={lockupLightUrl} className="only-light" alt="takenotes" draggable={false} />
            </div>
            <SettingRow label="takenotes" description={`Version ${version}. Filesystem-native Markdown notebook.`} />
            <SettingRow label="Software update" description={updatesEnabled ? "Stable releases only. Installer is checksum-verified." : "Available on Windows in this version."}>
              <Button disabled={!updatesEnabled} onClick={onCheckUpdates}>Check for updates</Button>
            </SettingRow>
            <SettingRow label="Source" description="Local-first. Your files stay where they are." />
          </>}
        </div>
      </div>
    </Dialog>
  );
}

/** Shortcut editor (Step 2): override-aware labels, capture-to-assign,
 * clear-to-unbind, reset-to-defaults. Collisions show ⚠ (last-write wins). */
export function ShortcutTable({ platform, hotkeys }: { platform: PlatformState; hotkeys?: HotkeysApi }): JSX.Element {
  const [capturing, setCapturing] = useState<CommandId | null>(null);
  const rows: [CommandId | "escape", string][] = [
    ["note.new", "New note"], ["quickOpen.open", "Quick open"], ["palette.open", "Commands"],
    ["editor.save", "Save"], ["note.close", "Close tab"], ["note.reopenClosed", "Reopen closed tab"],
    ["view.nextTab", "Next tab"], ["view.prevTab", "Previous tab"], ["view.tab1", "Go to tab 1–9"], ["view.toggleSidebar", "Toggle sidebar"], ["view.toggleFocus", "Focus mode"],
    ["settings.open", "Settings"], ["tree.rename", "Rename"], ["tree.trash", "Trash"], ["escape", "Close transient"],
  ];
  const collisionIds = new Set((hotkeys?.collisions ?? []).flatMap((c) => c.commands));
  return (<>
    {hotkeys && hotkeys.collisions.length > 0 && (
      <p className="inline-error" role="alert">⚠ {hotkeys.collisions.length} shortcut conflict{hotkeys.collisions.length === 1 ? "" : "s"} — last write wins, loser is disabled.</p>
    )}
    <table className="kbd-table"><tbody>
      {rows.map(([id, title]) => {
        const label = id === "escape" ? "Esc" : (hotkeys ? hotkeys.labelFor(id) || platform.shortcutLabel(id) : platform.shortcutLabel(id));
        const conflict = id !== "escape" && collisionIds.has(id);
        return <tr key={id}><td>{title}{conflict ? " ⚠" : ""}</td><td style={{ textAlign: "right" }}>
          {label ? <kbd className="k">{label}</kbd> : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>menu only</span>}
          {hotkeys && id !== "escape" && (
            capturing === id
              ? <Button onClick={() => setCapturing(null)}>Press keys… (Esc cancels)</Button>
              : <><Button onClick={() => setCapturing(id)}>Assign</Button><Button onClick={() => hotkeys.clear(id)}>Clear</Button></>
          )}
        </td></tr>;
      })}
    </tbody></table>
    {hotkeys && <Button onClick={() => hotkeys.resetAll()}>Reset to defaults</Button>}
    {capturing && <CaptureOverlay onCapture={(acc) => { if (acc) hotkeys!.assign(capturing, acc); setCapturing(null); }} onCancel={() => setCapturing(null)} />}
  </>);
}

function CaptureOverlay({ onCapture, onCancel }: { onCapture: (acc: string | null) => void; onCancel: () => void }): JSX.Element {
  return (
    <div className="scrim" onMouseDown={onCancel}>
      <div
        className="command-menu"
        role="dialog"
        aria-label="Assign shortcut"
        tabIndex={0}
        autoFocus
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.key === "Escape") { onCapture(null); return; }
          const acc = acceleratorFromKeyboardEvent(e.nativeEvent);
          if (acc) onCapture(acc);
        }}
      >
        <div className="cmd-list" role="listbox">
          <div className="cmd-section">Press the keys for this command… (<kbd className="k">Esc</kbd> cancels)</div>
        </div>
      </div>
    </div>
  );
}
