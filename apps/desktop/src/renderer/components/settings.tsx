import { useEffect, useState, type JSX } from "react";
import { moveRovingIndex } from "@takenotes/ui";
import { Button, Dialog, SettingRow } from "@takenotes/ui/dom";
import type { McpClientsSummary, TakeNotesApi } from "../../preload/index";
import type { Settings } from "./types";
import type { HotkeysApi } from "../hooks/use-hotkeys";
import { acceleratorFromKeyboardEvent } from "../hooks/use-hotkeys";
import lockupDarkUrl from "../assets/brand/takenotes-lockup-dark.svg";
import lockupLightUrl from "../assets/brand/takenotes-lockup-light.svg";
import type { PlatformState } from "../hooks/use-platform";
import type { CommandId } from "@takenotes/core/commands/registry";

const TABS = ["General", "Appearance", "Editor", "Files", "Automation", "Shortcuts", "About"] as const;

export function SettingsDialog({ settings, onChange, version, platform, hotkeys, updatesEnabled, onCheckUpdates, mcp, onClose }: {
  settings: Settings;
  onChange: (s: Settings) => void;
  version: string;
  platform: PlatformState;
  hotkeys?: HotkeysApi;
  updatesEnabled: boolean;
  onCheckUpdates: () => void;
  mcp?: TakeNotesApi["mcp"];
  onClose: () => void;
}): JSX.Element {
  const [tab, setTab] = useState<(typeof TABS)[number]>("General");
  const set = <K extends keyof Settings>(k: K, v: Settings[K]): void => onChange({ ...settings, [k]: v });
  return (
    <Dialog title="Settings" size="wide" onClose={onClose} closeOnBackdrop>
      <div className="settings-layout">
        {/* Step 9 keyboard nav: vertical tablist with roving tabindex —
          arrows/Home/End move with automatic activation, matching the
          shared moveRovingIndex mapping used by tabs and menus. */}
        <nav
          className="settings-nav"
          role="tablist"
          aria-label="Settings sections"
          aria-orientation="vertical"
          onKeyDown={(e) => {
            const next = moveRovingIndex(TABS.indexOf(tab), TABS.length, e.key, "vertical");
            if (next === null) return;
            e.preventDefault();
            const target = TABS[next]!;
            setTab(target);
            document.getElementById(`settings-tab-${target}`)?.focus();
          }}
        >
          {TABS.map((t) => (
            <button
              key={t}
              id={`settings-tab-${t}`}
              role="tab"
              aria-selected={tab === t}
              aria-controls="settings-panel"
              tabIndex={tab === t ? 0 : -1}
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
            >{t}</button>
          ))}
        </nav>
        <div className="settings-content" role="tabpanel" id="settings-panel" aria-labelledby={`settings-tab-${tab}`}>
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
          {tab === "Appearance" && (<>
            <SettingRow label="Theme" description="Follow system, or pick light / dark. Applies instantly; cursor, scroll, and undo are preserved.">
              {(control) => <select {...control} value={settings.theme} onChange={(e) => set("theme", e.target.value as Settings["theme"])}>
                <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
              </select>}
            </SettingRow>
            <SettingRow label="Accent" description="Links, focus rings, and selection. Every pair holds AA on the editor surface.">
              {(control) => <select {...control} value={settings.accent} onChange={(e) => set("accent", e.target.value as Settings["accent"])}>
                <option value="violet">Violet</option><option value="blue">Blue</option><option value="graphite">Graphite</option>
              </select>}
            </SettingRow>
            <SettingRow label="Editor font" description="Writing surface only; interface stays OS-native. No downloads, works offline.">
              {(control) => <select {...control} value={settings.editorFont} onChange={(e) => set("editorFont", e.target.value as Settings["editorFont"])}>
                <option value="system">System sans</option><option value="serif">Serif</option><option value="mono">Monospace</option>
              </select>}
            </SettingRow>
            <SettingRow label="Zoom" description="Whole-app zoom, 80–200%. View menu and palette adjust it too.">
              <span className="zoom-control" role="group" aria-label="Zoom">
                <Button aria-label="Zoom out" disabled={settings.zoomLevel <= 0.8} onClick={() => set("zoomLevel", Math.round((settings.zoomLevel - 0.1) * 10) / 10)}>−</Button>
                <span className="zoom-value" aria-live="polite">{Math.round(settings.zoomLevel * 100)}%</span>
                <Button aria-label="Zoom in" disabled={settings.zoomLevel >= 2} onClick={() => set("zoomLevel", Math.round((settings.zoomLevel + 0.1) * 10) / 10)}>+</Button>
                <Button aria-label="Reset zoom to 100%" disabled={settings.zoomLevel === 1} onClick={() => set("zoomLevel", 1)}>Reset</Button>
              </span>
            </SettingRow>
            <SettingRow label="Inline title" description="Editable note title above the editor. Off hides it; the file name still shows in tabs.">
              {(control) => <input {...control} type="checkbox" checked={settings.inlineTitle} onChange={(e) => set("inlineTitle", e.target.checked)} />}
            </SettingRow>
            <SettingRow label="Window frame" description="Native forces the OS title bar on every platform. Takes effect after restart — the current window keeps its frame until then.">
              {(control) => <select {...control} value={settings.frameStyle} onChange={(e) => set("frameStyle", e.target.value as Settings["frameStyle"])}>
                <option value="auto">System default</option><option value="native">Native frame</option>
              </select>}
            </SettingRow>
          </>)}
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
            <SettingRow label="Use [[Wikilinks]]" description="On writes [[links]]. Off writes [label](path.md) Markdown links (file links; #heading/#^block refinements stay [[…]]). Either form always opens.">
              {(control) => <input {...control} type="checkbox" checked={settings.useWikilinks} onChange={(e) => set("useWikilinks", e.target.checked)} />}
            </SettingRow>
            <SettingRow label="Template folder" description="Ordinary folder of .md templates, relative to the workspace root. Insert Template renders {{title}}, {{date}}, {{time}} only.">
              {(control) => <input {...control} type="text" value={settings.templateFolder} placeholder="Templates" onChange={(e) => set("templateFolder", e.target.value)} />}
            </SettingRow>
            <SettingRow label="New tasks go to" description="Daily appends to today's Daily Note (never created silently); Inbox appends to Inbox.md.">
              {(control) => <select {...control} value={settings.taskCaptureTarget} onChange={(e) => set("taskCaptureTarget", e.target.value as Settings["taskCaptureTarget"])}>
                <option value="daily">Today's Daily Note</option><option value="inbox">Inbox.md</option>
              </select>}
            </SettingRow>
            <SettingRow label="Update links on rename" description="Rewrite [[links]] when a note or folder moves. Off asks first and renames only.">
              {(control) => <input {...control} type="checkbox" checked={settings.autoUpdateLinks} onChange={(e) => set("autoUpdateLinks", e.target.checked)} />}
            </SettingRow>
            <SettingRow label="Attachment location" description="Where pasted and dropped files land. Subfolder nests the folder below; Folder uses it at the root.">
              {(control) => <select {...control} value={settings.attachmentLocation} onChange={(e) => set("attachmentLocation", e.target.value as Settings["attachmentLocation"])}>
                <option value="root">Workspace root</option><option value="same-folder">Same folder as note</option><option value="subfolder">Subfolder below note</option><option value="folder">Folder</option>
              </select>}
            </SettingRow>
            <SettingRow label="Attachment folder" description="Root-relative folder for Folder mode, subfolder name for Subfolder mode.">
              {(control) => <input {...control} type="text" value={settings.attachmentFolder} placeholder="attachments" onChange={(e) => set("attachmentFolder", e.target.value)} />}
            </SettingRow>
            <SettingRow label="Unsupported files" description="Import and link unknown file kinds, or skip them with a notice.">
              {(control) => <select {...control} value={settings.attachmentUnsupported} onChange={(e) => set("attachmentUnsupported", e.target.value as Settings["attachmentUnsupported"])}>
                <option value="link">Import + link</option><option value="skip">Skip</option>
              </select>}
            </SettingRow>
          </>}
          {tab === "Automation" && <AutomationTab mcp={mcp} />}
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

/** Automation approvals (Step 8, ADR-0012): per-client × per-workspace
 * grants for the `takenotes-mcp` stdio sidecar. Clients that tried and
 * were denied appear under Pending — approve them per workspace, or
 * revoke anytime. Grants persist in app-data; the activity tail is the
 * append-only MCP audit log. */
export function AutomationTab({ mcp }: { mcp?: TakeNotesApi["mcp"] }): JSX.Element {
  const [summary, setSummary] = useState<McpClientsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approveFor, setApproveFor] = useState<Record<string, string>>({});
  const refresh = (): void => {
    if (!mcp) return;
    void mcp.clients().then((res) => {
      if (res.ok) {
        setSummary(res.result);
        setError(null);
      } else {
        setError(res.error.message);
      }
    });
  };
  useEffect(refresh, [mcp]);
  if (!mcp) {
    return <p className="muted">Automation controls need the desktop app (no bridge in browser mode).</p>;
  }
  const act = (promise: Promise<{ ok: boolean; error?: { message: string } }>): void => {
    void promise.then((res) => {
      if (!res.ok) setError(res.error?.message ?? "Request failed.");
      refresh();
    });
  };
  return (<>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <SettingRow label="Sidecar command" description="Agents run this over stdio (JSON-RPC). The app must be open — otherwise calls fail fast.">
      {(control) => <input {...control} type="text" readOnly value={summary?.sidecarCommand ?? "…"} onFocus={(e) => e.target.select()} />}
    </SettingRow>
    <h3 className="settings-h">Pending approval</h3>
    {!summary ? <p className="muted">Loading…</p>
      : summary.pending.length === 0 ? <p className="muted">Nothing waiting. Denied clients appear here.</p>
        : summary.pending.map((clientId) => (
          <div className="mcp-client-row" key={clientId}>
            <span className="mcp-client-id">{clientId}</span>
            <select
              aria-label={`Workspace for ${clientId}`}
              value={approveFor[clientId] ?? summary.workspaces[0]?.id ?? ""}
              onChange={(e) => setApproveFor((prev) => ({ ...prev, [clientId]: e.target.value }))}
            >
              {summary.workspaces.map((w) => <option key={w.id} value={w.id}>{w.displayName}</option>)}
            </select>
            <Button
              disabled={summary.workspaces.length === 0}
              onClick={() => {
                const workspaceId = approveFor[clientId] ?? summary.workspaces[0]?.id;
                if (workspaceId) act(mcp.grant(clientId, workspaceId));
              }}
            >Approve</Button>
          </div>
        ))}
    <h3 className="settings-h">Approved clients</h3>
    {!summary ? <p className="muted">Loading…</p>
      : summary.granted.length === 0 ? <p className="muted">No clients approved. Approving grants one workspace at a time — never raw paths.</p>
        : summary.granted.map((client) => (
          <div className="mcp-client-block" key={client.clientId}>
            <div className="mcp-client-id">{client.clientId}</div>
            {client.grants.map((grant) => (
              <div className="mcp-client-row" key={grant.workspaceId}>
                <span>{grant.displayName ?? "(closed workspace)"}</span>
                <span className="muted">{new Date(grant.grantedAt).toLocaleDateString()}</span>
                <Button onClick={() => act(mcp.revoke(client.clientId, grant.workspaceId))}>Revoke</Button>
              </div>
            ))}
            <Button onClick={() => act(mcp.revoke(client.clientId))}>Revoke all</Button>
          </div>
        ))}
    <h3 className="settings-h">Recent activity</h3>
    {!summary ? <p className="muted">Loading…</p>
      : summary.activity.length === 0 ? <p className="muted">No MCP calls yet.</p>
        : <table className="kbd-table"><tbody>
          {summary.activity.slice(0, 10).map((entry) => (
            <tr key={entry.seq}>
              <td>{entry.clientId}</td>
              <td>{entry.tool}</td>
              <td style={{ textAlign: "right" }}>{entry.ok ? "ok" : (entry.errorCode ?? "error")}</td>
            </tr>
          ))}
        </tbody></table>}
  </>);
}

/** Shortcut editor (Step 2): override-aware labels, capture-to-assign,
 * clear-to-unbind, reset-to-defaults. Collisions show ⚠ (last-write wins). */
export function ShortcutTable({ platform, hotkeys }: { platform: PlatformState; hotkeys?: HotkeysApi }): JSX.Element {
  const [capturing, setCapturing] = useState<CommandId | null>(null);
  const rows: [CommandId | "escape", string][] = [
    ["note.new", "New note"], ["quickOpen.open", "Quick open"], ["palette.open", "Commands"],
    ["editor.save", "Save"], ["note.close", "Close tab"], ["note.reopenClosed", "Reopen closed tab"],
    ["view.nextTab", "Next tab"], ["view.prevTab", "Previous tab"], ["view.tab1", "Go to tab 1–9"], ["view.toggleSidebar", "Toggle sidebar"], ["view.toggleFocus", "Focus mode"],
    ["settings.open", "Settings"], ["tree.rename", "Rename"], ["tree.trash", "Trash"],
    ["app.zoomIn", "Zoom in"], ["app.zoomOut", "Zoom out"], ["app.zoomReset", "Actual size"],
    ["escape", "Close transient"],
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
