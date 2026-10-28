/** Full-width pages (prototype: Today, Tasks, and wrappers for Calendar,
 * Tags, Properties, Collections, Graph). They open in the main column in
 * place of the editor; every row still opens its source note. */
import { useMemo, useState, type JSX, type ReactNode } from "react";
import { Button } from "@takenotes/ui/dom";
import type { TodayGroups, TodayTaskItem } from "@takenotes/core/productivity/today";
import type { DocumentIndexEntry } from "@takenotes/core/index/document";
import { Icon } from "./icons";
import { displayPath, fileName } from "./types";
import type { TodayDaily } from "./today-pane";

export type PageView = "today" | "tasks" | "calendar" | "tags" | "properties" | "collections" | "graph";
export const PAGE_VIEWS: readonly PageView[] = ["today", "tasks", "calendar", "tags", "properties", "collections", "graph"];
export const PAGE_TITLES: Record<PageView, { title: string; sub: string }> = {
  today: { title: "Today", sub: "An aggregated view, not the daily note" },
  tasks: { title: "Tasks", sub: "Every task across this workspace" },
  calendar: { title: "Calendar", sub: "Event notes and scheduled tasks" },
  tags: { title: "Tags", sub: "Nested tags use slashes, for example #project/web" },
  properties: { title: "Details", sub: "Fields you add at the top of your notes" },
  collections: { title: "Collections", sub: "Saved queries shown as a table or a list" },
  graph: { title: "Graph", sub: "Notes as nodes, links as edges" },
};

export function PageShell({ view, actions, children }: { view: PageView; actions?: ReactNode; children: ReactNode }): JSX.Element {
  const meta = PAGE_TITLES[view];
  return (
    <div className="page-scroll">
      <div className="page" aria-label={meta.title}>
        <header className="page-h">
          <div>
            <h1>{meta.title}</h1>
            <p className="sub">{meta.sub}</p>
          </div>
          {actions && <div className="page-a">{actions}</div>}
        </header>
        {children}
      </div>
    </div>
  );
}

function fmtDay(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  return Number.isNaN(dt.getTime()) ? today : dt.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function Cbx({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }): JSX.Element {
  return <button className={`cbx${on ? " on" : ""}`} role="checkbox" aria-checked={on} aria-label={label} onClick={onClick} />;
}

const DRAG_TYPE = "takenotes/task";
function dragStart(e: React.DragEvent, rel: string, line: number): void {
  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ rel, line }));
  e.dataTransfer.effectAllowed = "move";
}
function readDrag(e: React.DragEvent): { rel: string; line: number } | null {
  const raw = e.dataTransfer.getData(DRAG_TYPE);
  if (!raw) return null;
  try { return JSON.parse(raw) as { rel: string; line: number }; } catch { return null; }
}
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
const hourLabel = (h: number): string => `${h > 12 ? h - 12 : h} ${h >= 12 ? "PM" : "AM"}`;

function TaskRow({ task, meta, onOpen, onToggle }: { task: { relativePath: string; line: number; description: string }; meta: string; onOpen: (rel: string, line: number) => void; onToggle: (rel: string, line: number) => void }): JSX.Element {
  return (
    <div className="trow" draggable onDragStart={(e) => dragStart(e, task.relativePath, task.line)}>
      <Cbx on={false} label={`Mark done: ${task.description}`} onClick={() => onToggle(task.relativePath, task.line)} />
      <div className="tr-t">
        <span>{task.description}</span>
        <small>{meta}</small>
      </div>
      <button className="linkbtn" onClick={() => onOpen(task.relativePath, task.line)} title={`${displayPath(task.relativePath)}:${task.line}`}>Open</button>
    </div>
  );
}

function Card({ title, count, tone, children }: { title: ReactNode; count?: number; tone?: "bad"; children: ReactNode }): JSX.Element {
  return (
    <section className="card">
      <h3>{title}{count !== undefined && <span className={`chip${tone === "bad" ? " bad" : ""}`}>{count}</span>}</h3>
      {children}
    </section>
  );
}

export function TodayPage({ groups, today, daily, recents, onOpen, onToggle, onSchedule, onNewNote, onNewTask, onOpenDaily }: {
  groups: TodayGroups;
  today: string;
  daily: TodayDaily;
  recents: string[];
  onOpen: (rel: string, line?: number) => void;
  onToggle: (rel: string, line: number) => void;
  /** `null` clears `@scheduled`; a number sets it to that hour today. */
  onSchedule: (rel: string, line: number, hour: number | null) => void;
  onNewNote: () => void;
  onNewTask: () => void;
  onOpenDaily: () => void;
}): JSX.Element {
  const none = <p className="muted">Nothing here.</p>;
  const rows = (list: TodayTaskItem[], meta: (t: TodayTaskItem) => string): JSX.Element | JSX.Element[] =>
    list.length === 0 ? none : list.map((t) => <TaskRow key={`${t.relativePath}:${t.line}`} task={t} meta={meta(t)} onOpen={onOpen} onToggle={onToggle} />);
  return (
    <div className="page-scroll">
      <div className="page" aria-label={`Today, ${today}`}>
        <header className="page-h">
          <div>
            <h1>Today</h1>
            <p className="sub">{fmtDay(today)} · an aggregated view, not the daily note</p>
          </div>
          <div className="page-a">
            <Button onClick={onNewTask}><Icon name="bolt" /> New task</Button>
            <Button onClick={onNewNote}><Icon name="plus" /> New note</Button>
          </div>
        </header>
        <div className="grid-2">
          <Card title={<><Icon name="calendar" /> Daily note</>}>
            {daily.exists ? (
              <>
                <p className="muted">{displayPath(daily.relativePath)} exists.</p>
                <Button onClick={onOpenDaily}>Open today&rsquo;s note</Button>
              </>
            ) : (
              <>
                <p className="muted">Today&rsquo;s daily note doesn&rsquo;t exist yet. It is only created when you ask.</p>
                <Button variant="primary" onClick={onOpenDaily}>Create today&rsquo;s note</Button>
              </>
            )}
          </Card>
          <Card title="Recent">
            {recents.length === 0 ? <p className="muted">No recent notes yet.</p> : recents.map((r) => (
              <button key={r} className="rp-item" onClick={() => onOpen(r)} title={displayPath(r)}>
                <b>{fileName(r)}</b><small>{displayPath(r)}</small>
              </button>
            ))}
          </Card>
        </div>
        <div className="grid-3">
          <Card title="Overdue" count={groups.overdue.length} tone="bad">{rows(groups.overdue, (t) => `${fileName(t.relativePath)} · due ${t.due ?? ""}`)}</Card>
          <Card title="Due today" count={groups.dueToday.length}>{rows(groups.dueToday, (t) => fileName(t.relativePath))}</Card>
          <Card title="Scheduled today" count={groups.scheduledToday.length}>{rows(groups.scheduledToday, (t) => `${t.scheduled ?? ""} · ${fileName(t.relativePath)}`)}</Card>
        </div>
        <Timeline groups={groups} today={today} onSchedule={onSchedule} onOpen={onOpen} />
      </div>
    </div>
  );
}

function Timeline({ groups, today, onSchedule, onOpen }: {
  groups: TodayGroups;
  today: string;
  onSchedule: (rel: string, line: number, hour: number | null) => void;
  onOpen: (rel: string, line?: number) => void;
}): JSX.Element {
  const [over, setOver] = useState<number | "none" | null>(null);
  const hourOf = (t: TodayTaskItem): number | null => {
    const m = /T(\d{2}):/.exec(t.scheduled ?? "");
    return m ? Number(m[1]) : null;
  };
  const unscheduled = [...groups.overdue, ...groups.dueToday].filter((t) => !groups.scheduledToday.some((s) => s.relativePath === t.relativePath && s.line === t.line));
  const drop = (e: React.DragEvent, hour: number | null): void => {
    e.preventDefault();
    setOver(null);
    const d = readDrag(e);
    if (d) onSchedule(d.rel, d.line, hour);
  };
  const allow = (e: React.DragEvent, key: number | "none"): void => { e.preventDefault(); setOver(key); };
  return (
    <section className="card" aria-label={`Timeline for ${today}`}>
      <h3>Timeline</h3>
      <p className="hint">Drag a task onto an hour to set @scheduled. @due is never changed.</p>
      <div className="timeline">
        {HOURS.map((h) => {
          const here = groups.scheduledToday.filter((t) => hourOf(t) === h);
          return (
            <div key={h} className="tl-row">
              <div className="tl-h">{hourLabel(h)}</div>
              <div className={`tl-drop${over === h ? " over" : ""}`} onDragOver={(e) => allow(e, h)} onDragLeave={() => setOver(null)} onDrop={(e) => drop(e, h)}>
                {here.map((t) => (
                  <div key={`${t.relativePath}:${t.line}`} className="blk" draggable onDragStart={(e) => dragStart(e, t.relativePath, t.line)}
                    title="Dragging changes @scheduled only. @due is not changed.">
                    <button className="linkbtn" onClick={() => onOpen(t.relativePath, t.line)}>{t.description}</button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className={`card drop${over === "none" ? " drop-active" : ""}`} onDragOver={(e) => allow(e, "none")} onDragLeave={() => setOver(null)} onDrop={(e) => drop(e, null)}>
        <h3>Unscheduled</h3>
        <p className="hint">Drag a timed task here to remove its @scheduled.</p>
        {unscheduled.length === 0 ? <p className="muted">Every open task has a time.</p> : unscheduled.map((t) => (
          <div key={`${t.relativePath}:${t.line}`} className="blk" draggable onDragStart={(e) => dragStart(e, t.relativePath, t.line)}>{t.description}</div>
        ))}
      </div>
    </section>
  );
}

type TaskFilter = "all" | "open" | "done";
const TASK_GROUPS = ["Overdue", "Today", "Upcoming", "No date", "Done"] as const;

export function TasksPage({ entries, today, onOpen, onToggle }: {
  entries: DocumentIndexEntry[] | null;
  today: string;
  onOpen: (rel: string, line?: number) => void;
  onToggle: (rel: string, line: number) => void;
}): JSX.Element {
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [folder, setFolder] = useState("");
  const all = useMemo(
    () => (entries ?? []).flatMap((e) => e.tasks.map((t) => ({ ...t, relativePath: e.relativePath }))),
    [entries],
  );
  const folders = useMemo(
    () => [...new Set(all.map((t) => (t.relativePath.includes("/") ? t.relativePath.slice(0, t.relativePath.lastIndexOf("/")) : "")))].filter(Boolean).sort(),
    [all],
  );
  const groupOf = (t: (typeof all)[number]): (typeof TASK_GROUPS)[number] => {
    if (t.completed) return "Done";
    if (t.due && t.due < today) return "Overdue";
    if (t.due === today || t.scheduled?.slice(0, 10) === today) return "Today";
    if (t.due || t.scheduled) return "Upcoming";
    return "No date";
  };
  const shown = all.filter((t) =>
    (filter === "all" || (filter === "open" ? !t.completed : t.completed)) &&
    (!folder || t.relativePath.startsWith(`${folder}/`)));
  return (
    <PageShell view="tasks">
      <div className="filters">
        <div className="seg" role="group" aria-label="Task filter">
          {(["all", "open", "done"] as const).map((f) => (
            <button key={f} className={filter === f ? "active" : ""} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f[0]!.toUpperCase() + f.slice(1)}</button>
          ))}
        </div>
        <select className="filter-select" aria-label="Folder" value={folder} onChange={(e) => setFolder(e.target.value)}>
          <option value="">All folders</option>
          {folders.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <span className="muted">{all.length} {all.length === 1 ? "task" : "tasks"}</span>
      </div>
      {shown.length === 0 && <p className="muted">No tasks match these filters.</p>}
      {TASK_GROUPS.map((g) => {
        const items = shown.filter((t) => groupOf(t) === g);
        if (items.length === 0) return null;
        return (
          <section key={g} className="tgroup">
            <h3>{g} <span className="count">{items.length}</span></h3>
            {items.map((t) => (
              <div key={`${t.relativePath}:${t.line}`} className={`trow${t.completed ? " done" : ""}`}>
                <Cbx on={t.completed} label={`${t.completed ? "Mark not done" : "Mark done"}: ${t.description}`} onClick={() => onToggle(t.relativePath, t.line)} />
                <div className="tr-t"><span>{t.description}</span><small>{displayPath(t.relativePath)}</small></div>
                {t.priority && <span className="chip">{t.priority}</span>}
                {t.due && <span className="chip due">Due {t.due.slice(5)}</span>}
                {t.scheduled && <span className="chip sch">Scheduled {t.scheduled.slice(5, 10)}</span>}
                <button className="linkbtn" onClick={() => onOpen(t.relativePath, t.line)}>Open in note</button>
              </div>
            ))}
          </section>
        );
      })}
    </PageShell>
  );
}
