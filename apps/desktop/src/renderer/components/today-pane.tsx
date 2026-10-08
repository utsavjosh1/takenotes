import type { JSX } from "react";
import type { TodayGroups, TodayTaskItem } from "@takenotes/core/productivity/today";
import { displayPath } from "./types";

function TaskRow({ task, meta, onOpen }: { task: TodayTaskItem; meta: string; onOpen: (rel: string, line: number) => void }): JSX.Element {
  return (
    <div
      className="cmd-item"
      role="option"
      aria-selected={false}
      onClick={() => onOpen(task.relativePath, task.line)}
      title={`${displayPath(task.relativePath)}:${task.line}`}
    >
      <span className="main-label">☐ {task.description}</span>
      <span className="sub-label">{meta}</span>
    </div>
  );
}

/** Today pane (productivity step 3): overdue + due-today tasks by `@due`,
 * plus today's time blocks by `@scheduled`. Read-only aggregation over the
 * document index — clicking a row opens the source note at the task line. */
export function TodayPane({ groups, today, onOpen }: {
  groups: TodayGroups;
  today: string;
  onOpen: (relativePath: string, line: number) => void;
}): JSX.Element {
  const empty = groups.overdue.length === 0 && groups.dueToday.length === 0 && groups.scheduledToday.length === 0;
  return (
    <div role="listbox" aria-label={`Today, ${today}`}>
      <div className="cmd-section">Today · {today}</div>
      {empty && <div className="cmd-section">Nothing due or scheduled. Enjoy the clear day.</div>}
      {groups.overdue.length > 0 && (
        <>
          <div className="cmd-section">Overdue ({groups.overdue.length})</div>
          {groups.overdue.map((t) => (
            <TaskRow key={`o:${t.relativePath}:${t.line}`} task={t} meta={`due ${t.due} · ${displayPath(t.relativePath)}`} onOpen={onOpen} />
          ))}
        </>
      )}
      {groups.dueToday.length > 0 && (
        <>
          <div className="cmd-section">Due today ({groups.dueToday.length})</div>
          {groups.dueToday.map((t) => (
            <TaskRow key={`d:${t.relativePath}:${t.line}`} task={t} meta={displayPath(t.relativePath)} onOpen={onOpen} />
          ))}
        </>
      )}
      {groups.scheduledToday.length > 0 && (
        <>
          <div className="cmd-section">Scheduled today ({groups.scheduledToday.length})</div>
          {groups.scheduledToday.map((t) => (
            <TaskRow key={`s:${t.relativePath}:${t.line}:${t.scheduled}`} task={t} meta={`${t.scheduled} · ${displayPath(t.relativePath)}`} onOpen={onOpen} />
          ))}
        </>
      )}
    </div>
  );
}
