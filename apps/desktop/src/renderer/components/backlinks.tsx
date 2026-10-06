import { useMemo, type JSX } from "react";
import type { DocumentIndexEntry } from "@takenotes/core/index/document";
import type { Edge } from "@takenotes/core/index/edges";
import { backlinksFor, outgoingFor } from "@takenotes/core/links/backlinks";

/** Backlinks + outgoing panes (Step 4, read-only). Pure derivation over
 * the typed edge table — this file owns presentation only. Clicking a
 * resolved row opens the note; unresolved outgoing targets render greyed
 * and inert (creation flow arrives later). */

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
  disabled,
  onOpen,
}: {
  title: string;
  sub: string;
  detail: string | null;
  disabled?: boolean;
  onOpen?: () => void;
}): JSX.Element {
  if (disabled || !onOpen) {
    return (
      <div className="link-row unresolved" title="No note resolves this link">
        <span className="label">{title}</span>
        {detail && <span className="link-detail">{detail}</span>}
      </div>
    );
  }
  return (
    <button className="link-row" onClick={onOpen} title={sub || title}>
      <span className="label">{title}</span>
      {sub && <span className="link-sub">{sub}</span>}
      {detail && <span className="link-detail">{detail}</span>}
    </button>
  );
}

export function BacklinksPane({
  activePath,
  edges,
  entries,
  onOpen,
}: {
  activePath: string;
  edges: Edge[];
  entries: DocumentIndexEntry[];
  onOpen: (rel: string) => void;
}): JSX.Element {
  const { linked, unlinked } = useMemo(() => backlinksFor(edges, entries, activePath), [edges, entries, activePath]);
  return (
    <section aria-label="Backlinks">
      <details open>
        <summary className="panel-title">Linked mentions · {linked.length}</summary>
        {linked.length === 0 ? (
          <p className="pane-hint">No notes link here yet.</p>
        ) : (
          linked.map((l, i) => (
            <Row
              key={`${l.from}:${l.line}:${i}`}
              title={base(l.from)}
              sub={dir(l.from)}
              detail={[l.embed ? "embed" : null, refDetail(l.alias, l.heading, l.blockAnchor, l.line)]
                .filter(Boolean)
                .join(" ") || null}
              onOpen={() => onOpen(l.from)}
            />
          ))
        )}
      </details>
      <details open>
        <summary className="panel-title">Unlinked mentions · {unlinked.length}</summary>
        {unlinked.length === 0 ? (
          <p className="pane-hint">No unlinked mentions found.</p>
        ) : (
          unlinked.map((u) => (
            <Row
              key={u.from}
              title={base(u.from)}
              sub={dir(u.from)}
              detail={`mentions “${u.matchedText}”`}
              onOpen={() => onOpen(u.from)}
            />
          ))
        )}
      </details>
    </section>
  );
}

export function OutgoingPane({
  activePath,
  edges,
  onOpen,
}: {
  activePath: string;
  edges: Edge[];
  onOpen: (rel: string) => void;
}): JSX.Element {
  const outgoing = useMemo(() => outgoingFor(edges, activePath), [edges, activePath]);
  return (
    <section aria-label="Outgoing links">
      <details open>
        <summary className="panel-title">Outgoing · {outgoing.length}</summary>
        {outgoing.length === 0 ? (
          <p className="pane-hint">This note links nowhere yet.</p>
        ) : (
          outgoing.map((o, i) => {
            const resolved = o.to !== null;
            const title = resolved ? base(o.to!) : o.target || "(empty)";
            return (
              <Row
                key={`${o.target}:${o.line}:${i}`}
                title={title}
                sub={resolved ? dir(o.to!) : "unresolved"}
                detail={[o.embed ? "embed" : null, refDetail(o.alias, o.heading, o.blockAnchor, o.line)]
                  .filter(Boolean)
                  .join(" ") || null}
                disabled={!resolved}
                onOpen={resolved ? () => onOpen(o.to!) : undefined}
              />
            );
          })
        )}
      </details>
    </section>
  );
}
