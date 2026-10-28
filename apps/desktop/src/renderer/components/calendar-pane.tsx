import { useMemo, useState, type JSX } from "react";
import {
  addDays,
  collectCalendarRange,
  rangeForMode,
  type CalendarDay,
  type CalendarEventItem,
  type CalendarMode,
  type CalendarTaskItem,
} from "@takenotes/core/productivity/calendar";
import type { DocumentIndexEntry } from "@takenotes/core/index/document";
import { displayPath } from "./types";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function weekdayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return DAY_NAMES[(new Date(y!, m! - 1, d!, 12).getDay() + 6) % 7]!;
}

function shiftMonth(anchor: string, delta: number): string {
  const [y, m, d] = anchor.split("-").map(Number);
  const target = new Date(y!, m! - 1 + delta, Math.min(d!, new Date(y!, m! - 1 + delta + 1, 0).getDate()), 12);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`;
}

type DragPayload = { relativePath: string; line: number };

function readDrag(e: React.DragEvent): DragPayload | null {
  try {
    const raw = e.dataTransfer.getData("application/x-takenotes-task");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DragPayload>;
    if (typeof parsed.relativePath !== "string" || typeof parsed.line !== "number") return null;
    return { relativePath: parsed.relativePath, line: parsed.line };
  } catch {
    return null;
  }
}

/** Density caps: day/week sections show all events (usually few, time-anchored)
 * but cap tasks with an in-place expander; month cells stay at 1+2 with
 * "+N more" navigating to the day view (which itself expands in place,
 * so the escape hatch never dead-ends on another cap). */
const MONTH_VISIBLE_EVENTS = 1;
const MONTH_VISIBLE_TASKS = 2;
const DAY_VISIBLE_TASKS = 5;

function TaskRow({ task, onOpen, compact }: { task: CalendarTaskItem; onOpen: () => void; compact?: boolean }): JSX.Element {
  return (
    <div
      className="list-item"
      role="option"
      aria-selected={false}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-takenotes-task", JSON.stringify({ relativePath: task.relativePath, line: task.line }));
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onOpen}
      title={`${compact ? `${task.scheduled} · ` : ""}${displayPath(task.relativePath)}:${task.line}${task.due ? ` (due ${task.due})` : ""}`}
    >
      <span className="main-label">☐ {task.description}</span>
      {!compact && <span className="sub-label">{task.scheduled}{task.due ? ` · due ${task.due}` : ""}</span>}
    </div>
  );
}

function EventChip({ event, onOpen }: { event: CalendarEventItem; onOpen: () => void }): JSX.Element {
  const time = event.start.length > 10 ? event.start.slice(11, 16) : "";
  return (
    <div className="list-item" role="option" aria-selected={false} onClick={onOpen} title={displayPath(event.relativePath)}>
      <span className="main-label">◷ {time ? `${time} ` : ""}{event.title}</span>
      <span className="sub-label">event</span>
    </div>
  );
}

function DaySection({ day, isToday, onOpenTask, onOpenNote, onReschedule }: {
  day: CalendarDay;
  isToday: boolean;
  onOpenTask: (relativePath: string, line: number) => void;
  onOpenNote: (relativePath: string) => void;
  onReschedule: (relativePath: string, line: number, targetDate: string) => void;
}): JSX.Element {
  const [over, setOver] = useState(false);
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const payload = readDrag(e);
        if (payload) onReschedule(payload.relativePath, payload.line, day.date);
      }}
      style={over ? { outline: "1px dashed var(--accent)", outlineOffset: -1 } : undefined}
    >
      <div className="list-section">{weekdayLabel(day.date)} {day.date}{isToday ? " · today" : ""}</div>
      {day.events.map((ev) => (
        <EventChip key={`e:${ev.relativePath}`} event={ev} onOpen={() => onOpenNote(ev.relativePath)} />
      ))}
      {(expanded ? day.tasks : day.tasks.slice(0, DAY_VISIBLE_TASKS)).map((t) => (
        <TaskRow key={`t:${t.relativePath}:${t.line}`} task={t} onOpen={() => onOpenTask(t.relativePath, t.line)} />
      ))}
      {!expanded && day.tasks.length > DAY_VISIBLE_TASKS && (
        <button className="list-item" style={{ cursor: "pointer" }} onClick={() => setExpanded(true)}>
          +{day.tasks.length - DAY_VISIBLE_TASKS} more
        </button>
      )}
      {expanded && day.tasks.length > DAY_VISIBLE_TASKS && (
        <button className="list-item" style={{ cursor: "pointer" }} onClick={() => setExpanded(false)}>
          Show less
        </button>
      )}
      {day.events.length === 0 && day.tasks.length === 0 && <div className="list-section">—</div>}
    </div>
  );
}

/** Calendar pane (productivity step 4): day/week/month ranges over event
 * notes (`type: event`) and `@scheduled` tasks. Dragging a task onto a day
 * rewrites only its `@scheduled` token — never `@due`. */
export function CalendarPane({ entries, today, onOpenTask, onOpenNote, onReschedule }: {
  entries: DocumentIndexEntry[];
  today: string;
  onOpenTask: (relativePath: string, line: number) => void;
  onOpenNote: (relativePath: string) => void;
  onReschedule: (relativePath: string, line: number, targetDate: string) => void;
}): JSX.Element {
  const [mode, setMode] = useState<CalendarMode>("week");
  const [anchor, setAnchor] = useState(today);
  const range = useMemo(() => rangeForMode(mode, anchor), [mode, anchor]);
  const days = useMemo(() => {
    try {
      return collectCalendarRange(entries, range.start, range.end);
    } catch {
      return [] as CalendarDay[];
    }
  }, [entries, range.start, range.end]);

  const shift = (delta: number): void => {
    if (mode === "day") setAnchor(addDays(anchor, delta));
    else if (mode === "week") setAnchor(addDays(anchor, delta * 7));
    else setAnchor(shiftMonth(anchor, delta));
  };
  const goToDay = (date: string): void => {
    setAnchor(date);
    setMode("day");
  };

  return (
    <div aria-label="Calendar">
      <div className="list-section" style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <button className={`list-item${mode === "day" ? " selected" : ""}`} aria-pressed={mode === "day"} onClick={() => setMode("day")}>Day</button>
        <button className={`list-item${mode === "week" ? " selected" : ""}`} aria-pressed={mode === "week"} onClick={() => setMode("week")}>Week</button>
        <button className={`list-item${mode === "month" ? " selected" : ""}`} aria-pressed={mode === "month"} onClick={() => setMode("month")}>Month</button>
        <span style={{ flex: 1 }} />
        <button className="list-item" aria-label="Previous" onClick={() => shift(-1)}>‹</button>
        <button className="list-item" onClick={() => { setAnchor(today); }}>Today</button>
        <button className="list-item" aria-label="Next" onClick={() => shift(1)}>›</button>
      </div>
      {mode === "month" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
          {days.map((day) => (
            <MonthCell
              key={day.date}
              day={day}
              isToday={day.date === today}
              onOpenDay={() => goToDay(day.date)}
              onOpenTask={onOpenTask}
              onOpenNote={onOpenNote}
              onReschedule={onReschedule}
            />
          ))}
        </div>
      ) : (
        <div role="listbox" aria-label={mode === "day" ? `Day, ${range.start}` : `Week, ${range.start} to ${range.end}`}>
          {days.map((day) => (
            <DaySection
              key={day.date}
              day={day}
              isToday={day.date === today}
              onOpenTask={onOpenTask}
              onOpenNote={onOpenNote}
              onReschedule={onReschedule}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MonthCell({ day, isToday, onOpenDay, onOpenTask, onOpenNote, onReschedule }: {
  day: CalendarDay;
  isToday: boolean;
  onOpenDay: () => void;
  onOpenTask: (relativePath: string, line: number) => void;
  onOpenNote: (relativePath: string) => void;
  onReschedule: (relativePath: string, line: number, targetDate: string) => void;
}): JSX.Element {
  const [over, setOver] = useState(false);
  const shownEvents = day.events.slice(0, MONTH_VISIBLE_EVENTS);
  const shownTasks = day.tasks.slice(0, MONTH_VISIBLE_TASKS);
  const hidden = day.events.length - shownEvents.length + (day.tasks.length - shownTasks.length);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const payload = readDrag(e);
        if (payload) onReschedule(payload.relativePath, payload.line, day.date);
      }}
      style={{
        minHeight: 44,
        border: "1px solid var(--line)",
        borderRadius: 4,
        padding: 2,
        background: isToday ? "var(--selection)" : over ? "var(--hover)" : "transparent",
        outline: over ? "1px dashed var(--accent)" : undefined,
      }}
      title={`${day.date} — drop a task to schedule it here`}
    >
      <button className="list-section" style={{ padding: 2, cursor: "pointer", fontWeight: isToday ? 700 : 400 }} onClick={onOpenDay} aria-label={`Open day ${day.date}`}>
        {day.date.slice(8)}
      </button>
      {shownEvents.map((ev) => (
        <EventChip key={`e:${ev.relativePath}`} event={ev} onOpen={() => onOpenNote(ev.relativePath)} />
      ))}
      {shownTasks.map((t) => (
        <TaskRow key={`t:${t.relativePath}:${t.line}`} task={t} compact onOpen={() => onOpenTask(t.relativePath, t.line)} />
      ))}
      {hidden > 0 && (
        <button className="list-section" style={{ padding: "0 2px", cursor: "pointer" }} onClick={onOpenDay}>
          +{hidden} more
        </button>
      )}
    </div>
  );
}
