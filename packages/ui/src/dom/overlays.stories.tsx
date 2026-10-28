import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import {
  Banner, Button, CommandPalette, ConfirmDialog, ErrorDialog, Icon, IconButton, Menu, Popover, Rail, SaveStatePill,
  StatusBar, Tabs, TitleBar, ToastProvider, Tooltip, TreeRow, useToast, type MenuItemDef, type PaletteItem,
} from "./index";

const meta: Meta = { title: "Overlays and shell" };
export default meta;
type Story = StoryObj;

const MENU: MenuItemDef[] = [
  { id: "open", label: "Open in new tab", icon: "file", hint: "Ctrl+Enter" },
  { id: "rename", label: "Rename", icon: "edit", hint: "F2" },
  { id: "move", label: "Move to…", disabled: "Select one note first" },
  { id: "sep", label: "", separator: true },
  { id: "delete", label: "Delete", icon: "trash", danger: true },
];

export const MenuAndTooltip: Story = { render: () => {
  const [at, setAt] = useState<DOMRect | null>(null);
  const [picked, setPicked] = useState("nothing yet");
  return <>
    <div className="sb-row">
      <Tooltip text="More actions"><IconButton label="More actions" onClick={(e) => setAt(e.currentTarget.getBoundingClientRect())}><Icon name="dots" /></IconButton></Tooltip>
      <span>Picked: {picked}</span>
    </div>
    {at && <Menu label="Note actions" items={MENU} anchor={at} onSelect={setPicked} onClose={() => setAt(null)} />}
  </>;
} };

export const PopoverPanel: Story = { render: () => {
  const [at, setAt] = useState<DOMRect | null>(null);
  return <>
    <Button onClick={(e) => setAt(e.currentTarget.getBoundingClientRect())}>Set due date</Button>
    {at && <Popover label="Due date" anchor={at} onClose={() => setAt(null)}><label>Date <input type="date" /></label></Popover>}
  </>;
} };

function ToastButtons() {
  const toast = useToast();
  return <div className="sb-row">
    <Button onClick={() => toast.show("Note moved to the trash.", { undo: { run: () => toast.show("Restored.") } })}>Delete with undo</Button>
    <Button onClick={() => toast.show("Could not save: the folder is read-only.", { kind: "error" })}>Show error</Button>
    <Button onClick={() => { toast.show("First"); toast.show("Second"); }}>Queue two</Button>
  </div>;
}
export const Toasts: Story = { render: () => <ToastProvider><ToastButtons /></ToastProvider> };

export const Banners: Story = { render: () => <>
  <Banner title="Indexing your notes.">This takes a moment on the first open.</Banner>
  <Banner tone="warn" title="This note changed on disk." actions={[<Button key="a" size="sm">Show changes</Button>, <Button key="b" size="sm" variant="primary">Keep mine</Button>]}>Another app saved it after you opened it.</Banner>
  <Banner tone="danger" compact title="Could not reach the folder.">Check that the drive is connected.</Banner>
</> };

export const Dialogs: Story = { render: () => {
  const [open, setOpen] = useState<"confirm" | "error" | null>(null);
  return <>
    <div className="sb-row">
      <Button variant="danger" onClick={() => setOpen("confirm")}>Delete notes…</Button>
      <Button onClick={() => setOpen("error")}>Show error</Button>
    </div>
    {open === "confirm" && <ConfirmDialog title="Delete notes" destructive confirmLabel="Delete 3 notes" count={{ n: 3, singular: "note" }}
      onCancel={() => setOpen(null)} onConfirm={() => setOpen(null)}>They move to the trash and can be restored for 30 days.</ConfirmDialog>}
    {open === "error" && <ErrorDialog title="Could not save the note" cause="The folder is read-only, so nothing was written."
      details={"EACCES: permission denied, open '/mnt/notes/plan.md'"} action={{ label: "Choose another folder", run: () => setOpen(null) }} onClose={() => setOpen(null)} />}
  </>;
} };

const ITEMS: PaletteItem[] = [
  { id: "plan", label: "Weekly plan", description: "Projects", tag: "recent" },
  { id: "read", label: "Reading list", description: "Personal" },
  { id: "del", label: "Delete note", disabledReason: "Open a note first", hint: "Del" },
];
export const Palette: Story = { render: () => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const shown = ITEMS.filter((i) => String(i.label).toLowerCase().includes(q.toLowerCase()));
  return <>
    <Button onClick={() => setOpen(true)}>Open palette</Button>
    {open && <CommandPalette label="Quick open" placeholder="Find a note…" query={q} onQueryChange={setQ} groups={[{ heading: "Notes", items: shown }]}
      modes={[{ id: "cmd", label: "Commands", key: ">", active: false }, { id: "tag", label: "Tags", key: "#", active: false }]}
      hints={[{ keys: ["↑", "↓"], text: "move" }, { keys: ["Enter"], text: "open" }, { keys: ["Esc"], text: "close" }]}
      emptyText="No notes match." onSelect={() => setOpen(false)} onClose={() => setOpen(false)} />}
  </>;
} };

export const TabStrip: Story = { render: () => {
  const [tabs, setTabs] = useState(["Weekly plan", "Reading list", "Ideas", "Meeting notes", "Budget", "Travel", "Recipes", "Garden"].map((label, i) => ({ id: String(i), label, dirty: i === 1, conflict: i === 2 })));
  const [active, setActive] = useState<string | null>("0");
  return <Tabs tabs={tabs} activeId={active} onActivate={setActive} onClose={(id) => setTabs((t) => t.filter((x) => x.id !== id))} />;
} };

export const Shell: Story = { render: () => <div style={{ inlineSize: 600, border: "1px solid var(--line)" }}>
  <TitleBar start={<strong>takenotes</strong>} end={<IconButton label="Settings"><Icon name="gear" /></IconButton>} />
  <div style={{ display: "flex", blockSize: 220 }}>
    <Rail items={[{ id: "f", label: "Files", icon: "file", active: true, onSelect: () => {} }, { id: "s", label: "Search", icon: "search", onSelect: () => {} }, { id: "t", label: "Tasks", icon: "tasks", onSelect: () => {} }]}
      footer={[{ id: "g", label: "Settings", icon: "gear", onSelect: () => {} }]} />
    <div role="tree" aria-label="Notes" style={{ padding: 4, flex: 1, background: "var(--side)" }}>
      <TreeRow label="Projects" folder expanded count={2} />
      <TreeRow label="Weekly plan" depth={1} active />
      <TreeRow label="Reading list" depth={1} />
      <TreeRow label="Journal" folder count={12} />
    </div>
  </div>
  <StatusBar start={<span>Local folder</span>} end={<><span>412 words</span><SaveStatePill state="saved" /></>} />
</div> };
