import { useEffect, useRef, useState, type JSX } from "react";
import type { SearchMatch } from "../../shared/contracts/ipc";
import { displayPath } from "./types";

export function SearchPanel({
  query,
  onQuery,
  searching,
  searchError,
  filenameHits,
  contentHits,
  onOpen,
}: {
  query: string;
  onQuery: (q: string) => void;
  searching: boolean;
  searchError: string | null;
  filenameHits: SearchMatch[];
  contentHits: SearchMatch[];
  onOpen: (rel: string, line?: number) => void;
}): JSX.Element {
  return (
    <div>
      <div className="panel-title">Search</div>
      <div className="search-box">
        <input
          className="search-input"
          placeholder="Search notes…"
          value={query}
          aria-label="Search notes"
          onChange={(e) => onQuery(e.target.value)}
        />
      </div>
      {searching && <div className="panel-title">Searching…</div>}
      {searchError && <div className="panel-title" role="alert">{searchError}</div>}
      {!searching && !searchError && query.trim() === "" && (
        <div className="panel-title">Type to search file names and contents.</div>
      )}
      {filenameHits.length > 0 && (
        <>
          <div className="panel-title">Files</div>
          {filenameHits.map((m) => (
            <SearchRow key={`f:${m.relativePath}`} match={m} onOpen={onOpen} filenameOnly />
          ))}
        </>
      )}
      {contentHits.length > 0 && (
        <>
          <div className="panel-title">Contents</div>
          {contentHits.map((m) => (
            <SearchRow key={`c:${m.relativePath}:${m.line}`} match={m} onOpen={onOpen} query={query} />
          ))}
        </>
      )}
      {!searching && !searchError && query.trim() !== "" && filenameHits.length === 0 && contentHits.length === 0 && (
        <div className="panel-title">No matches for “{query.trim()}”.</div>
      )}
    </div>
  );
}

function highlight(preview: string, query?: string): JSX.Element {
  if (!query || !query.trim()) return <>{preview}</>;
  const i = preview.toLowerCase().indexOf(query.trim().toLowerCase());
  if (i < 0) return <>{preview}</>;
  return (
    <>
      {preview.slice(0, i)}
      <mark>{preview.slice(i, i + query.trim().length)}</mark>
      {preview.slice(i + query.trim().length)}
    </>
  );
}

function SearchRow({
  match,
  onOpen,
  query,
  filenameOnly,
}: {
  match: SearchMatch;
  onOpen: (rel: string, line?: number) => void;
  query?: string;
  filenameOnly?: boolean;
}): JSX.Element {
  const rel = displayPath(match.relativePath);
  const name = rel.slice(rel.lastIndexOf("/") + 1);
  return (
    <button className="search-result" style={{ width: "100%", textAlign: "left" }} onClick={() => onOpen(match.relativePath, match.line || undefined)}>
      <div className="f" title={rel}>{highlight(name, filenameOnly ? query : undefined)}</div>
      <div className="p">{rel}</div>
      {!filenameOnly && (
        <div className="s">
          {match.line > 0 && <span style={{ color: "var(--text-muted)" }}>{match.line} · </span>}
          {highlight(match.preview, query)}
        </div>
      )}
    </button>
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
