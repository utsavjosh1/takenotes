import { useMemo, useState, type JSX } from "react";
import type { DocumentIndexEntry } from "@takenotes/core/index/document";
import type { Edge } from "@takenotes/core/index/edges";
import {
  backlinksFor,
  matchesMentionFilter,
  mentionContext,
  outgoingFor,
  outgoingUnlinked,
  sortMentionRows,
  type MentionSort,
} from "@takenotes/core/links/backlinks";

/** Backlinks + outgoing panes (Step 4). Pure derivation over the typed
 * edge table — this file owns presentation only. Clicking a resolved row
 * opens the note; clicking an unresolved outgoing target creates it
 * (follow-to-create, via `onCreateLink`); the link button on an unlinked
 * row converts the mention (`[[Canon|Alias]]`, via `onLinkMention`). */

function base(rel: string): string {
  const p = rel.replace(/\\/g, "/");
  return p.slice(p.lastIndexOf("/") + 1);
}

function dir(rel: string): string {
  const p = rel.replace(/\\/g, "/");
  const i = p.lastIndexOf("/");
  return i < 0 ? "" : p.slice(0, i);
}

function refDetail(alias?: string, heading?: string, blockAnchor?: string, line?: number): string | null {
  const bits: string[] = [];
  if (alias) bits.push(`as ${alias}`);
  if (heading) bits.push(`#${heading}`);
  if (blockAnchor) bits.push(`#^${blockAnchor}`);
  if (line) bits.push(`:${line}`);
  return bits.length > 0 ? bits.join(" ") : null;
}

function Row({
  title,
  sub,
  detail,
  context,
  fullPath,
  disabled,
  onOpen,
  onCreate,
  actionLabel,
  actionTitle,
  onAction,
}: {
  title: string;
  sub: string;
  detail: string | null;
  /** Source-line context under the row (null = none found). */
  context?: string | null;
  /** Full workspace-relative path for hover disambiguation. */
  fullPath?: string;
  disabled?: boolean;
  onOpen?: () => void;
  /** Unresolved-link action: create the note and open it. */
  onCreate?: () => void;
  /** Unlinked-mention action label (e.g. "link"). */
  actionLabel?: string;
  /** Hover text for the action (names the link target). */
  actionTitle?: string;
  /** Unlinked-mention action: convert the mention into a real link. */
  onAction?: () => void;
}): JSX.Element {
  const body = (
    <>
      <span className="label">{title}</span>
      {sub && <span className="link-sub">{sub}</span>}
      {detail && <span className="link-detail">{detail}</span>}
      {onAction && (
        <button
          type="button"
          className="link-action"
          title={actionTitle ?? `Convert the mention into a link`}
          aria-label={actionTitle ?? `Convert the mention into a link`}
          onClick={(e) => {
            e.stopPropagation();
            onAction();
          }}
        >
          {actionLabel ?? "link"}
        </button>
      )}
      {context && <span className="link-context">{context}</span>}
    </>
  );
  if ((disabled || !onOpen) && !onCreate) {
    return (
      <div className="link-row unresolved" title={fullPath ?? "No note resolves this link"}>
        {body}
      </div>
    );
  }
  if (onCreate && !onOpen) {
    return (
      <button className="link-row unresolved create" onClick={onCreate} title={fullPath ? `${fullPath} — click to create it` : "No note resolves this link — click to create it"}>
        <span className="label">{title}</span>
        <span className="link-sub">create</span>
        {detail && <span className="link-detail">{detail}</span>}
        {context && <span className="link-context">{context}</span>}
      </button>
    );
  }
  return (
    <button className="link-row" onClick={onOpen} title={fullPath ?? sub ?? title}>
      {body}
    </button>
  );
}

/** Filter box + sort select shared by both panes. Local state lives in the
 * pane; matching/sorting are pure core helpers (tested, no DOM). */
function PaneControls({
  query,
  onQuery,
  sort,
  onSort,
}: {
  query: string;
  onQuery: (q: string) => void;
  sort: MentionSort;
  onSort: (s: MentionSort) => void;
}): JSX.Element {
  return (
    <div className="link-controls" role="search">
      <input
        className="link-filter"
        type="search"
        placeholder="Filter mentions…"
        aria-label="Filter mentions"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
      />
      <select
        className="link-sort"
        aria-label="Sort mentions"
        value={sort}
        onChange={(e) => onSort(e.target.value as MentionSort)}
      >
        <option value="name">Name</option>
        <option value="modified">Modified</option>
      </select>
    </div>
  );
}

const CODE_CAVEAT = "Mentions inside code blocks still count — the index keeps fenced code.";

export function BacklinksPane({
  activePath,
  edges,
  entries,
  onOpen,
  onLinkMention,
}: {
  activePath: string;
  edges: Edge[];
  entries: DocumentIndexEntry[];
  onOpen: (rel: string) => void;
  /** Alias action: convert an unlinked mention into `[[Canon|Alias]]`. */
  onLinkMention?: (from: string, matchedText: string, target: string) => void;
}): JSX.Element {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<MentionSort>("name");
  const { linked, unlinked } = useMemo(() => backlinksFor(edges, entries, activePath), [edges, entries, activePath]);
  const byPath = useMemo(() => new Map(entries.map((e) => [e.relativePath, e] as const)), [entries]);
  const visibleLinked = useMemo(
    () =>
      sortMentionRows(
        linked.filter((l) => matchesMentionFilter(l, query, byPath.get(l.from))),
        entries,
        sort,
        (l) => l.from,
      ),
    [linked, query, byPath, entries, sort],
  );
  const visibleUnlinked = useMemo(
    () =>
      sortMentionRows(
        unlinked.filter((u) => matchesMentionFilter(u, query, byPath.get(u.from))),
        entries,
        sort,
        (u) => u.from,
      ),
    [unlinked, query, byPath, entries, sort],
  );
  return (
    <section aria-label="Backlinks">
      <PaneControls query={query} onQuery={setQuery} sort={sort} onSort={setSort} />
      <details open>
        <summary className="panel-title">Linked mentions · {visibleLinked.length}</summary>
        {visibleLinked.length === 0 ? (
          <p className="pane-hint">No notes link here yet.</p>
        ) : (
          visibleLinked.map((l, i) => (
            <Row
              key={`${l.from}:${l.line}:${i}`}
              title={base(l.from)}
              sub={dir(l.from)}
              detail={[l.embed ? "embed" : null, refDetail(l.alias, l.heading, l.blockAnchor, l.line)]
                .filter(Boolean)
                .join(" ") || null}
              context={mentionContext(entries, l)}
              fullPath={l.from}
              onOpen={() => onOpen(l.from)}
            />
          ))
        )}
      </details>
      <details open>
        <summary className="panel-title">Unlinked mentions · {visibleUnlinked.length}</summary>
        {visibleUnlinked.length === 0 ? (
          <p className="pane-hint">No unlinked mentions found.</p>
        ) : (
          <>
            {visibleUnlinked.map((u) => (
              <Row
                key={u.from}
                title={base(u.from)}
                sub={dir(u.from)}
                detail={`mentions “${u.matchedText}”`}
                context={mentionContext(entries, u)}
                fullPath={u.from}
                onOpen={() => onOpen(u.from)}
                actionLabel="link"
                actionTitle={`Convert “${u.matchedText}” into [[${base(activePath)}|${u.matchedText}]]`}
                onAction={onLinkMention ? () => onLinkMention(u.from, u.matchedText, activePath) : undefined}
              />
            ))}
            <p className="pane-hint">{CODE_CAVEAT}</p>
          </>
        )}
      </details>
    </section>
  );
}

export function OutgoingPane({
  activePath,
  edges,
  entries,
  onOpen,
  onCreateLink,
  onLinkMention,
}: {
  activePath: string;
  edges: Edge[];
  entries: DocumentIndexEntry[];
  onOpen: (rel: string) => void;
  /** Follow-to-create for unresolved targets (Step 4): raw link text in. */
  onCreateLink?: (rawTarget: string) => void;
  /** Alias action: convert an unlinked mention into `[[Canon|Alias]]`. */
  onLinkMention?: (from: string, matchedText: string, target: string) => void;
}): JSX.Element {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<MentionSort>("name");
  const outgoing = useMemo(() => outgoingFor(edges, activePath), [edges, activePath]);
  const unlinked = useMemo(() => outgoingUnlinked(edges, entries, activePath), [edges, entries, activePath]);
  const byPath = useMemo(() => new Map(entries.map((e) => [e.relativePath, e] as const)), [entries]);
  const resolved = useMemo(
    () =>
      sortMentionRows(
        outgoing.filter((o) => o.to !== null && matchesMentionFilter({ from: o.to! }, query, byPath.get(o.to!))),
        entries,
        sort,
        (o) => o.to!,
      ),
    [outgoing, query, byPath, entries, sort],
  );
  const unresolved = useMemo(() => outgoing.filter((o) => o.to === null), [outgoing]);
  const visibleUnlinked = useMemo(
    () =>
      sortMentionRows(
        unlinked.filter((u) => matchesMentionFilter({ from: u.to }, query, byPath.get(u.to))),
        entries,
        sort,
        (u) => u.to,
      ),
    [unlinked, query, entries, sort],
  );
  return (
    <section aria-label="Outgoing links">
      <PaneControls query={query} onQuery={setQuery} sort={sort} onSort={setSort} />
      <details open>
        <summary className="panel-title">Outgoing · {resolved.length}</summary>
        {resolved.length === 0 ? (
          <p className="pane-hint">This note links nowhere yet.</p>
        ) : (
          resolved.map((o, i) => (
            <Row
              key={`${o.target}:${o.line}:${i}`}
              title={base(o.to!)}
              sub={dir(o.to!)}
              detail={[o.embed ? "embed" : null, refDetail(o.alias, o.heading, o.blockAnchor, o.line)]
                .filter(Boolean)
                .join(" ") || null}
              context={mentionContext(entries, { from: activePath, line: o.line })}
              fullPath={o.to!}
              onOpen={() => onOpen(o.to!)}
            />
          ))
        )}
      </details>
      {unresolved.length > 0 && (
        <details open>
          <summary className="panel-title">Unresolved · {unresolved.length}</summary>
          {unresolved.map((o, i) => (
            <Row
              key={`${o.target}:${o.line}:${i}`}
              title={o.target || "(empty)"}
              sub="unresolved"
              detail={[o.embed ? "embed" : null, refDetail(o.alias, o.heading, o.blockAnchor, o.line)]
                .filter(Boolean)
                .join(" ") || null}
              context={mentionContext(entries, { from: activePath, line: o.line })}
              fullPath={o.target}
              disabled
              onCreate={onCreateLink && o.target ? () => onCreateLink(o.target) : undefined}
            />
          ))}
        </details>
      )}
      <details>
        <summary className="panel-title">Unlinked mentions · {visibleUnlinked.length}</summary>
        {visibleUnlinked.length === 0 ? (
          <p className="pane-hint">No unlinked mentions of other notes here.</p>
        ) : (
          <>
            {visibleUnlinked.map((u) => (
              <Row
                key={u.to}
                title={base(u.to)}
                sub={dir(u.to)}
                detail={`mentions “${u.matchedText}”`}
                context={mentionContext(entries, { from: activePath, matchedText: u.matchedText })}
                fullPath={u.to}
                onOpen={() => onOpen(u.to)}
                actionLabel="link"
                actionTitle={`Convert “${u.matchedText}” into [[${base(u.to)}|${u.matchedText}]]`}
                onAction={onLinkMention ? () => onLinkMention(activePath, u.matchedText, u.to) : undefined}
              />
            ))}
            <p className="pane-hint">{CODE_CAVEAT}</p>
          </>
        )}
      </details>
    </section>
  );
}
