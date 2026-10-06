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

function TaskRow({ task, onOpen, compact }: { task: CalendarTaskItem; onOpen: () => void; compact?: boolean }): JSX.Element {
  return (
    <div
      className="cmd-item"
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
    <div className="cmd-item" role="option" aria-selected={false} onClick={onOpen} title={displayPath(event.relativePath)}>
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
      <div className="cmd-section">{weekdayLabel(day.date)} {day.date}{isToday ? " · today" : ""}</div>
      {day.events.map((ev) => (
        <EventChip key={`e:${ev.relativePath}`} event={ev} onOpen={() => onOpenNote(ev.relativePath)} />
      ))}
      {day.tasks.map((t) => (
        <TaskRow key={`t:${t.relativePath}:${t.line}`} task={t} onOpen={() => onOpenTask(t.relativePath, t.line)} />
      ))}
      {day.events.length === 0 && day.tasks.length === 0 && <div className="cmd-section">—</div>}
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
      <div className="cmd-section" style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <button className={`cmd-item${mode === "day" ? " selected" : ""}`} aria-pressed={mode === "day"} onClick={() => setMode("day")}>Day</button>
        <button className={`cmd-item${mode === "week" ? " selected" : ""}`} aria-pressed={mode === "week"} onClick={() => setMode("week")}>Week</button>
        <button className={`cmd-item${mode === "month" ? " selected" : ""}`} aria-pressed={mode === "month"} onClick={() => setMode("month")}>Month</button>
        <span style={{ flex: 1 }} />
        <button className="cmd-item" aria-label="Previous" onClick={() => shift(-1)}>‹</button>
        <button className="cmd-item" onClick={() => { setAnchor(today); }}>Today</button>
        <button className="cmd-item" aria-label="Next" onClick={() => shift(1)}>›</button>
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
  const shownEvents = day.events.slice(0, 1);
  const shownTasks = day.tasks.slice(0, 2);
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
        border: "1px solid var(--border)",
        borderRadius: 4,
        padding: 2,
        background: isToday ? "var(--selection)" : over ? "var(--hover)" : "transparent",
        outline: over ? "1px dashed var(--accent)" : undefined,
      }}
      title={`${day.date} — drop a task to schedule it here`}
    >
      <div className="cmd-section" style={{ padding: 2, cursor: "pointer", fontWeight: isToday ? 700 : 400 }} onClick={onOpenDay}>
        {day.date.slice(8)}
      </div>
      {shownEvents.map((ev) => (
        <div key={`e:${ev.relativePath}`} className="cmd-item" style={{ padding: "0 2px" }} role="option" aria-selected={false} onClick={() => onOpenNote(ev.relativePath)} title={ev.title}>
          <span className="main-label" style={{ fontSize: 11 }}>◷ {ev.title}</span>
        </div>
      ))}
      {shownTasks.map((t) => (
        <div
          key={`t:${t.relativePath}:${t.line}`}
          className="cmd-item"
          style={{ padding: "0 2px" }}
          role="option"
          aria-selected={false}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("application/x-takenotes-task", JSON.stringify({ relativePath: t.relativePath, line: t.line }));
            e.dataTransfer.effectAllowed = "move";
          }}
          onClick={() => onOpenTask(t.relativePath, t.line)}
          title={`${t.description} · ${t.scheduled}${t.due ? ` (due ${t.due})` : ""}`}
        >
          <span className="main-label" style={{ fontSize: 11 }}>☐ {t.description}</span>
        </div>
      ))}
      {hidden > 0 && (
        <div className="cmd-section" style={{ padding: "0 2px", cursor: "pointer" }} onClick={onOpenDay}>
          +{hidden} more
        </div>
      )}
    </div>
  );
}
