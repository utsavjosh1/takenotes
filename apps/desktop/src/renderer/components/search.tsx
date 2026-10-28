import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { moveRovingIndex } from "@takenotes/ui";
import { HITS_PER_PAGE, SEARCH_FILTERS, type NoteHits, type SearchHit } from "@takenotes/core/search/hits";
import { displayPath } from "./types";

export type SearchPanelProps = {
  query: string;
  onQuery: (q: string) => void;
  searching: boolean;
  searchError: string | null;
  notes: NoteHits[];
  matchCase: boolean;
  onMatchCase: (v: boolean) => void;
  context: number;
  onContext: (n: number) => void;
  onOpen: (rel: string, line?: number) => void;
  /** Workspace-index completeness notice: shown when safety bounds may have omitted notes. */
  notice: string | null;
  /** Pins the current search to Favourites. */
  onPin?: (query: string) => void;
};

/** Words to emphasise in a hit line: plain words from the query, minus operators and negations. */
function termsFrom(query: string, matchCase: boolean): RegExp | null {
  const words: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query)) !== null) {
    const w = m[1] ?? m[2]!;
    if (m[2] !== undefined && (w.startsWith("-") || w.includes(":") || /^[()[\]]/.test(w) || w === "OR" || w === "AND")) continue;
    if (w) words.push(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  }
  return words.length === 0 ? null : new RegExp(`(${words.join("|")})`, matchCase ? "g" : "gi");
}

function Marked({ text, re }: { text: string; re: RegExp | null }): JSX.Element {
  if (!re) return <>{text}</>;
  return <>{text.split(re).map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : part))}</>;
}

export function SearchPanel(p: SearchPanelProps): JSX.Element {
  const { query, searching, searchError, notes } = p;
  const inputRef = useRef<HTMLInputElement>(null);
  const [shown, setShown] = useState(HITS_PER_PAGE);
  useEffect(() => setShown(HITS_PER_PAGE), [query, p.matchCase]);
  const re = useMemo(() => termsFrom(query, p.matchCase), [query, p.matchCase]);
  const idle = query.trim() === "";
  // One Tab stop for the whole result list; arrows, Home and End move focus.
  const listRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(0);

  // Show hits until the page budget runs out; a note with no matching line still gets its row.
  const rows = useMemo(() => {
    let left = shown;
    const out: Array<{ note: NoteHits; hits: SearchHit[] }> = [];
    for (const note of notes) {
      if (left <= 0) break;
      const hits = note.hits.slice(0, left);
      left -= Math.max(hits.length, 1);
      out.push({ note, hits });
    }
    return out;
  }, [notes, shown]);
  const totalHits = useMemo(() => notes.reduce((n, x) => n + Math.max(x.total, 1), 0), [notes]);
  const shownHits = rows.reduce((n, r) => n + Math.max(r.hits.length, 1), 0);

  const addChip = (chip: string): void => {
    const sep = query === "" || query.endsWith(" ") ? "" : " ";
    p.onQuery(`${query}${sep}${chip}`);
    inputRef.current?.focus();
  };

  return (
    <div className="search-panel">
      <div className="search-box">
        <label className="search-label" htmlFor="search-input">Search notes</label>
        <input id="search-input" ref={inputRef} className="search-input" type="search" value={query} placeholder="Search notes…"
          aria-invalid={searchError ? true : undefined} aria-describedby={searchError ? "search-err" : undefined}
          onChange={(e) => p.onQuery(e.target.value)} />
        {searchError && <p id="search-err" className="search-err" role="alert">{searchError}</p>}
        <div className="search-chips" role="group" aria-label="Add a filter">
          {SEARCH_FILTERS.map((c) => (
            <button key={c} type="button" className="search-chip" onClick={() => addChip(c)}>{c}</button>
          ))}
        </div>
        {!idle && !searchError && p.onPin && (
          <button type="button" className="search-pin" onClick={() => p.onPin?.(query.trim())}>☆ Save this search to Favourites</button>
        )}
        <div className="search-opts">
          <label className="search-check"><input type="checkbox" checked={p.matchCase} onChange={(e) => p.onMatchCase(e.target.checked)} /> Match case</label>
          <label className="search-range">Context lines <b>{p.context}</b>
            <input type="range" min={0} max={3} step={1} value={p.context} aria-label="Context lines" onChange={(e) => p.onContext(Number(e.target.value))} />
          </label>
        </div>
      </div>

      {!searching && !searchError && p.notice && <p className="search-note" role="note">{p.notice}</p>}

      {idle && (
        <div className="search-empty">
          <b>Find anything in your notes</b>
          <p>Type a word or phrase. Add filters like <code>tag:project</code> or <code>task:open</code> to narrow it down.</p>
        </div>
      )}

      {searching && !idle && (
        <div className="search-skeleton" role="status" aria-label="Searching">
          {[0, 1, 2, 3].map((i) => <div key={i} className="sk-row"><span className="sk" /><span className="sk short" /></div>)}
        </div>
      )}

      {!searching && !idle && !searchError && notes.length === 0 && (
        <div className="search-empty" role="status">
          <b>No notes match</b>
          <p>Nothing found for “{query.trim()}”. Try fewer words, or turn off Match case.</p>
        </div>
      )}

      {!searching && notes.length > 0 && (
        <>
          <p className="search-count" role="status">{notes.length} {notes.length === 1 ? "note" : "notes"}, {totalHits} {totalHits === 1 ? "match" : "matches"}</p>
          <div className="search-results" ref={listRef} onKeyDown={(e) => {
            const count = listRef.current?.querySelectorAll("[data-search-idx]").length ?? 0;
            const next = moveRovingIndex(Math.min(focused, count - 1), count, e.key, "vertical");
            if (next === null) return;
            e.preventDefault();
            setFocused(next);
            listRef.current?.querySelector<HTMLElement>(`[data-search-idx="${next}"]`)?.focus();
          }}>
            {(() => { let n = -1; return rows.map(({ note, hits }) => { const headIdx = ++n; const hitIdx = hits.map(() => ++n); return (
              <section key={note.relativePath} className="sres-note" aria-label={note.title}>
                <button className="sres-head" data-search-idx={headIdx} tabIndex={headIdx === Math.min(focused, 1e9) ? 0 : -1} onFocus={() => setFocused(headIdx)} onClick={() => p.onOpen(note.relativePath)} title={displayPath(note.relativePath)}>
                  <b>{note.title}</b>
                  <span className="sres-count">{note.total > 0 ? note.total : "match"}</span>
                </button>
                {hits.map((h, hi) => (
                  <button key={h.line} className="sres-hit" data-search-idx={hitIdx[hi]} tabIndex={hitIdx[hi] === focused ? 0 : -1} onFocus={() => setFocused(hitIdx[hi]!)} onClick={() => p.onOpen(note.relativePath, h.line)}>
                    {h.before.map((t, i) => <span key={`b${i}`} className="sres-ctx"><i>{h.line - h.before.length + i}</i>{t}</span>)}
                    <span className="sres-line"><i>{h.line}</i><span><Marked text={h.text.trim()} re={re} /></span></span>
                    {h.after.map((t, i) => <span key={`a${i}`} className="sres-ctx"><i>{h.line + 1 + i}</i>{t}</span>)}
                  </button>
                ))}
              </section>
            ); }); })()}
          </div>
          {shownHits < totalHits && (
            <button className="search-more" onClick={() => setShown((n) => n + HITS_PER_PAGE)}>Show more ({totalHits - shownHits} left)</button>
          )}
        </>
      )}
    </div>
  );
}

export function useDebouncedValue<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setV(value), ms);
    return () => {
      if (t.current) clearTimeout(t.current);
    };
  }, [value, ms]);
  return v;
}
