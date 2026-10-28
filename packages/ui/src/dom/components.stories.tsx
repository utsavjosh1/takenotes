import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import {
  ART_NAMES, Art, Badge, Button, Card, Checkbox, Chip, DataTable, EmptyState, ICON_NAMES, Icon, IconButton,
  Input, Kbd, Pill, Progress, Select, Skeleton, Stepper, Switch, Textarea, TextField,
} from "./index";

const meta: Meta = { title: "Foundation" };
export default meta;
type Story = StoryObj;

const Block = ({ label, children }: { label: string; children: ReactNode }) =>
  <section><p className="sb-label">{label}</p><div className="sb-row">{children}</div></section>;

export const Buttons: Story = { render: () => <>
  <Block label="Variants">
    <Button>Default</Button><Button variant="primary">Primary</Button><Button variant="ghost">Ghost</Button><Button variant="danger">Delete</Button>
  </Block>
  <Block label="Sizes (26 / 30 / 36)">
    <Button size="sm">Small</Button><Button>Medium</Button><Button size="lg">Large</Button>
  </Block>
  <Block label="States">
    <Button disabled>Disabled</Button><Button pending pendingLabel="Saving…">Save</Button>
    <Button><Icon name="plus" size="sm" />With icon</Button>
  </Block>
  <Block label="Icon buttons">
    <IconButton label="Add"><Icon name="plus" /></IconButton><IconButton label="Search"><Icon name="search" /></IconButton>
    <IconButton label="More" disabled><Icon name="dots" /></IconButton>
  </Block>
</> };

export const Fields: Story = { render: () => <>
  <TextField label="Note title" description="Shown at the top of the page." placeholder="Untitled" />
  <TextField label="Folder name" error="A folder with this name already exists." defaultValue="Projects" />
  <Block label="Bare controls">
    <Input aria-label="Search" placeholder="Search" />
    <Select aria-label="Sort"><option>Name</option><option>Modified</option></Select>
  </Block>
  <Textarea aria-label="Description" placeholder="Write a few words" />
  <Textarea aria-label="Description with error" invalid defaultValue="Too short" />
  <Input aria-label="Disabled" disabled defaultValue="Disabled" />
</> };

export const Toggles: Story = { render: () => <>
  <Block label="Switch"><Switch label="Off" /><Switch label="On" defaultChecked /><Switch label="Disabled" disabled /></Block>
  <Block label="Checkbox">
    <Checkbox label="Open" /><Checkbox label="Done" defaultChecked /><Checkbox label="Disabled" disabled />
    <Checkbox aria-label="Task done" defaultChecked />
  </Block>
</> };

export const Labels: Story = { render: () => <>
  <Block label="Chip"><Chip>Neutral</Chip><Chip tone="due">Due today</Chip><Chip tone="planned">Planned Fri</Chip><Chip tone="priority">High</Chip><Chip tone="success">Done</Chip></Block>
  <Block label="Badge"><Badge>12</Badge><Badge tone="ok">Synced</Badge><Badge tone="warn">Conflict</Badge><Badge tone="bad">Error</Badge></Block>
  <Block label="Pill"><Pill>Local</Pill><Pill tone="accent" dot>Editing</Pill><Pill tone="ok" dot>Saved</Pill><Pill tone="warn" dot>Unsaved</Pill><Pill tone="bad" dot>Offline</Pill></Block>
  <Block label="Kbd"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></Block>
</> };

export const Surfaces: Story = { render: () => <>
  <Card><strong>Today</strong><p>Three tasks are due.</p></Card>
  <Card accent><strong>Agent changes</strong><p>Waiting for review.</p></Card>
  <Skeleton lines={3} />
  <Progress value={40} label="Importing notes" />
  <Progress label="Working" />
  <Stepper label="Setup" steps={[
    { id: "1", label: "Check Windows", state: "done" },
    { id: "2", label: "Install Ubuntu", state: "working" },
    { id: "3", label: "Start helper", state: "pending" },
    { id: "4", label: "Connect", state: "failed", error: "Port 4317 is already in use." },
  ]} />
</> };

type Row = { id: string; name: string; tag: string; modified: string };
const rows: Row[] = [
  { id: "1", name: "Weekly plan", tag: "planning", modified: "Today" },
  { id: "2", name: "Reading list", tag: "personal", modified: "Yesterday" },
  { id: "3", name: "A note with a very long title that has to be cut off before it breaks the layout of the table", tag: "misc", modified: "Mon" },
];
export const Table: Story = { render: () => <DataTable label="Notes" rows={rows} rowKey={(r) => r.id} onRowActivate={() => {}}
  columns={[
    { key: "n", header: "Note", render: (r: Row) => r.name },
    { key: "t", header: "Tag", render: (r: Row) => <Chip>{r.tag}</Chip>, width: "110px" },
    { key: "m", header: "Changed", render: (r: Row) => r.modified, width: "100px" },
  ]} /> };

export const EmptyStates: Story = { render: () => <>
  {ART_NAMES.map((a) => <EmptyState key={a} art={a} title={`No ${a} yet`} description="Nothing here. Start with one." actions={<Button variant="primary">Create</Button>} />)}
</> };

export const Icons: Story = { render: () => <div className="sb-icons">
  {ICON_NAMES.map((n) => <span key={n}><Icon name={n} />{n}</span>)}
  <span><Icon name="check" size="sm" />sm 18</span><span><Icon name="check" size="xs" />xs 14</span>
  <span><Art name="notes" style={{ inlineSize: 64 }} />art</span>
</div> };
