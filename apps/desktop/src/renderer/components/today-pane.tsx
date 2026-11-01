import type { JSX } from "react";
import { Button, EmptyState } from "@takenotes/ui/dom";
import type { TodayGroups, TodayTaskItem } from "@takenotes/core/productivity/today";
import { displayPath, fileName } from "./types";

export type TodayDaily = { relativePath: string; exists: boolean };

function TaskRow({ task, meta, onOpen }: { task: TodayTaskItem; meta: string; onOpen: (rel: string, line: number) => void }): JSX.Element {
  return (
    <button
      className="list-item"
      style={{ width: "100%", textAlign: "left", cursor: "pointer" }}
      onClick={() => onOpen(task.relativePath, task.line)}
      title={`${displayPath(task.relativePath)}:${task.line} — opens the source note`}
    >
      <span className="main-label">☐ {task.description}</span>
      <span className="sub-label">{meta}</span>
    </button>
  );
}

/** Focus-style header (calm editorial): large weekday, quiet date line. */
function DayHeader({ today }: { today: string }): JSX.Element {
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  const valid = !Number.isNaN(dt.getTime());
  const weekday = valid ? dt.toLocaleDateString(undefined, { weekday: "long" }) : "Today";
  const rest = valid ? dt.toLocaleDateString(undefined, { month: "long", day: "numeric" }) : today;
  return (
    <div style={{ padding: "16px 12px 4px" }}>
      <h2 style={{ margin: 0, fontSize: 26, fontWeight: 750, letterSpacing: "-0.02em", lineHeight: 1.2 }}>{weekday}</h2>
      <div className="list-section" style={{ padding: "2px 0 0" }}>{rest} · {today}</div>
    </div>
  );
}

/**
 * Today aggregate (ADR-0011): scheduled blocks + overdue/due-today tasks +
 * the Daily Note (row, or an explicit create action — never silent) +
 * recent notes + quick actions. Read-only aggregation over the document
 * index; every row opens its source. This is the view, not the Daily file.
 */
export function TodayPane({ groups, today, daily, recents, onOpen, onNewNote, onNewTask, onOpenDaily }: {
  groups: TodayGroups;
  today: string;
  daily: TodayDaily;
  recents: string[];
  onOpen: (relativePath: string, line?: number) => void;
  onNewNote: () => void;
  onNewTask: () => void;
  onOpenDaily: () => void;
}): JSX.Element {
  const noTasks = groups.overdue.length === 0 && groups.dueToday.length === 0 && groups.scheduledToday.length === 0;
  const allClear = noTasks && !daily.exists && recents.length === 0;
  return (
    <div aria-label={`Today, ${today}`}>
      <DayHeader today={today} />
      <div style={{ display: "flex", gap: 8, padding: "4px 12px 8px", flexWrap: "wrap" }}>
        <Button onClick={onNewNote}>New note</Button>
        <Button onClick={onNewTask}>New task</Button>
        <Button onClick={onOpenDaily}>Open today&rsquo;s note</Button>
      </div>
      {allClear ? (
        <EmptyState
          title="A clear day"
          description="Nothing due or scheduled, and today's note hasn't been started."
          actions={<Button variant="primary" onClick={onOpenDaily}>Create today&rsquo;s note</Button>}
        />
      ) : (
        <>
          {noTasks && (
            <div className="list-section">Nothing due or scheduled. Enjoy the clear day.</div>
          )}
          {groups.scheduledToday.length > 0 && (
            <>
              <div className="list-section">Scheduled today ({groups.scheduledToday.length})</div>
              {groups.scheduledToday.map((t) => (
                <TaskRow key={`s:${t.relativePath}:${t.line}`} task={t} meta={`${t.scheduled}${t.due ? ` · due ${t.due}` : ""} · ${displayPath(t.relativePath)}`} onOpen={onOpen} />
              ))}
            </>
          )}
          {groups.overdue.length > 0 && (
            <>
              <div className="list-section">Overdue ({groups.overdue.length})</div>
              {groups.overdue.map((t) => (
                <TaskRow key={`o:${t.relativePath}:${t.line}`} task={t} meta={`due ${t.due} · ${displayPath(t.relativePath)}`} onOpen={onOpen} />
              ))}
            </>
          )}
          {groups.dueToday.length > 0 && (
            <>
              <div className="list-section">Due today ({groups.dueToday.length})</div>
              {groups.dueToday.map((t) => (
                <TaskRow key={`d:${t.relativePath}:${t.line}`} task={t} meta={displayPath(t.relativePath)} onOpen={onOpen} />
              ))}
            </>
          )}
          <div className="list-section">Today&rsquo;s note</div>
          {daily.exists ? (
            <button
              className="list-item"
              style={{ width: "100%", textAlign: "left", cursor: "pointer" }}
              onClick={() => onOpenDaily()}
              title={`${displayPath(daily.relativePath)} — opens the Daily Note (Today stays here)`}
            >
              <span className="main-label">{fileName(daily.relativePath)}</span>
              <span className="sub-label">{displayPath(daily.relativePath)}</span>
            </button>
          ) : (
            <div style={{ padding: "4px 12px" }}>
              <div className="list-section">Today&rsquo;s note hasn&rsquo;t been started.</div>
              <Button variant="primary" onClick={onOpenDaily}>Create today&rsquo;s note</Button>
            </div>
          )}
          {recents.length > 0 && (
            <>
              <div className="list-section">Recent ({recents.length})</div>
              {recents.map((r) => (
                <button
                  key={r}
                  className="list-item"
                  style={{ width: "100%", textAlign: "left", cursor: "pointer" }}
                  onClick={() => onOpen(r)}
                  title={`${displayPath(r)} — opens the note`}
                >
                  <span className="main-label">{fileName(r)}</span>
                  <span className="sub-label">{displayPath(r)}</span>
                </button>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
