import { useEffect, useMemo, useState, type JSX } from "react";
import { Checkbox, IconButton, Input } from "@takenotes/ui/dom";
import type { DocumentIndexEntry } from "@takenotes/core/index/document";
import type { Edge } from "@takenotes/core/index/edges";
import type { PropertyRegistry } from "@takenotes/core/index/properties";
import { backlinksFor, mentionContext, outgoingFor } from "@takenotes/core/links/backlinks";
import { editDetail, panelHeadings, readDetails, type DetailField } from "@takenotes/core/links/side-panel";
import { Icon } from "./icons";

const stem = (rel: string): string => (rel.replace(/\\/g, "/").split("/").pop() ?? rel).replace(/\.md$/i, "");
const folder = (rel: string): string => {
  const p = rel.replace(/\\/g, "/");
  const i = p.lastIndexOf("/");
  return i < 0 ? "Top folder" : p.slice(0, i);
};

/** The note stays responsive while typing: the panel reads a copy that trails by 200 ms. */
function useTrailing<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export type SidePanelDoc = { key: string; relativePath: string; content: string };

export function SidePanel({
  doc, entries, edges, registry, onClose, onGotoLine, onOpen, onCreate, onLinkIt, onEditContent, onFixAsText, onPinHeading,
}: {
  doc: SidePanelDoc | null;
  entries: DocumentIndexEntry[];
  edges: Edge[];
  registry: PropertyRegistry;
  onClose: () => void;
  onGotoLine: (line: number) => void;
  onOpen: (rel: string) => void;
  /** Creates the note a link points to. */
  onCreate: (target: string) => void;
  /** Turns plain text in another note into a link to this one. */
  onLinkIt: (from: string, matchedText: string, target: string) => void;
  /** Writes new text for the open note (goes through the editor, so undo and saving work). */
  onEditContent: (key: string, content: string) => void;
  onFixAsText: (key: string) => void;
  /** Pins a heading of the open note to Favourites. */
  onPinHeading?: (rel: string, heading: string) => void;
}): JSX.Element {
  const shown = useTrailing(doc, 200);
  return (
    <aside className="sidebar right rightpanel" aria-label="Note panel">
      <div className="sidebar-head">
        <span className="grow" />
        <IconButton label="Close side panel" onClick={onClose}><Icon name="x" /></IconButton>
      </div>
      <div className="sidebar-body sp-body">
        {shown ? <PanelSections doc={shown} live={doc} entries={entries} edges={edges} registry={registry}
          onGotoLine={onGotoLine} onOpen={onOpen} onCreate={onCreate} onLinkIt={onLinkIt} onEditContent={onEditContent} onFixAsText={onFixAsText} onPinHeading={onPinHeading} />
          : <p className="sp-empty">Open a note to see what links to it, its sections, and its details.</p>}
      </div>
    </aside>
  );
}

function PanelSections({ doc, live, entries, edges, registry, onGotoLine, onOpen, onCreate, onLinkIt, onEditContent, onFixAsText, onPinHeading }: {
  doc: SidePanelDoc; live: SidePanelDoc | null; entries: DocumentIndexEntry[]; edges: Edge[]; registry: PropertyRegistry;
  onGotoLine: (n: number) => void; onOpen: (rel: string) => void; onCreate: (t: string) => void;
  onLinkIt: (from: string, matched: string, target: string) => void; onEditContent: (k: string, c: string) => void; onFixAsText: (k: string) => void;
  onPinHeading?: (rel: string, heading: string) => void;
}): JSX.Element {
  const title = stem(doc.relativePath);
  const headings = useMemo(() => panelHeadings(doc.content, title), [doc.content, title]);
  const { linked, unlinked } = useMemo(() => backlinksFor(edges, entries, doc.relativePath), [edges, entries, doc.relativePath]);
  const outgoing = useMemo(() => {
    const seen = new Set<string>();
    return outgoingFor(edges, doc.relativePath).filter((o) => {
      const k = o.to ?? `?${o.target.toLowerCase()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [edges, doc.relativePath]);
  const linkedNotes = useMemo(() => [...new Map(linked.map((l) => [l.from, l])).values()], [linked]);
  const details = useMemo(() => readDetails(doc.content, registry), [doc.content, registry]);
  const hasDetails = details.broken || details.fields.length > 0;

  return (
    <>
      {headings.length > 0 && (
        <section className="sp-sec" aria-label="On this page">
          <h4 className="sp-h">On this page</h4>
          {headings.map((h) => (
            <div key={`${h.line}:${h.text}`} className="sp-head-row">
              <button className="sp-head" style={{ paddingLeft: 8 + h.indent * 12 }} onClick={() => onGotoLine(h.line)}>{h.text}</button>
              {onPinHeading && <button className="sp-pin" aria-label={`Add “${h.text}” to favourites`} title="Add to favourites" onClick={() => onPinHeading(doc.relativePath, h.text)}>☆</button>}
            </div>
          ))}
        </section>
      )}
      {linkedNotes.length > 0 && (
        <section className="sp-sec" aria-label="Linked from">
          <h4 className="sp-h">Linked from <span className="count">{linkedNotes.length}</span></h4>
          {linkedNotes.map((l) => (
            <button key={l.from} className="sp-card" onClick={() => onOpen(l.from)}>
              <b>{stem(l.from)}</b><small>{folder(l.from)}</small>
            </button>
          ))}
        </section>
      )}
      {unlinked.length > 0 && (
        <section className="sp-sec" aria-label="Mentioned without a link">
          <h4 className="sp-h">Mentioned without a link <span className="count">{unlinked.length}</span></h4>
          {unlinked.map((u) => (
            <div key={u.from} className="sp-card static">
              <button className="sp-card-main" onClick={() => onOpen(u.from)}>
                <b>{stem(u.from)}</b><small>{folder(u.from)}</small>
                <span className="sp-line">{mentionContext(entries, u) ?? `“${u.matchedText}”`}</span>
              </button>
              <button className="sp-btn" onClick={() => onLinkIt(u.from, u.matchedText, doc.relativePath)}>Link it</button>
            </div>
          ))}
        </section>
      )}
      {outgoing.length > 0 && (
        <section className="sp-sec" aria-label="Links to">
          <h4 className="sp-h">Links to <span className="count">{outgoing.length}</span></h4>
          {outgoing.map((o) => o.to ? (
            <button key={o.to} className="sp-card" onClick={() => onOpen(o.to!)}>
              <b>{stem(o.to)}</b><small>{folder(o.to)}</small>
            </button>
          ) : (
            <div key={`?${o.target}`} className="sp-card static missing">
              <div className="sp-card-main"><b>{o.target || "(empty)"}</b><small>No note with this name yet</small></div>
              {o.target && <button className="sp-btn" onClick={() => onCreate(o.target)}>Create it</button>}
            </div>
          ))}
        </section>
      )}
      {hasDetails && (
        <details className="sp-sec sp-details" open={details.broken}>
          <summary className="sp-h">Details {!details.broken && <span className="count">{details.fields.length}</span>}</summary>
          {details.broken ? (
            <div className="sp-warn" role="alert">
              <p>The details at the top of this note can’t be read, so they can’t be edited here.</p>
              <button className="sp-btn" onClick={() => onFixAsText(doc.key)}>Fix as text</button>
            </div>
          ) : (
            <>
              {details.fields.map((f) => (
                <DetailRow key={f.name} field={f} content={doc.content} disabled={!live || live.content !== doc.content}
                  onSave={(c) => live && onEditContent(live.key, c)} />
              ))}
              <p className="sp-hint">Change a value here. To add a new detail, use the … menu, then Edit as plain text.</p>
            </>
          )}
        </details>
      )}
    </>
  );
}

function DetailRow({ field, content, disabled, onSave }: { field: DetailField; content: string; disabled: boolean; onSave: (content: string) => void }): JSX.Element {
  const [draft, setDraft] = useState<string>(String(field.value));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setDraft(String(field.value)); setError(null); }, [field.value]);
  const commit = (raw: string | number | boolean): void => {
    if (String(raw) === String(field.value)) { setError(null); return; }
    const res = editDetail(content, field, raw);
    if ("error" in res) { setError(res.error); return; }
    setError(null);
    onSave(res.content);
  };
  const id = `detail-${field.name}`;
  return (
    <div className="sp-prop">
      <label htmlFor={id} className="sp-pk">{field.name}</label>
      {field.kind === "checkbox" ? (
        <Checkbox id={id} checked={field.value === true} disabled={disabled} onChange={(e) => commit(e.target.checked)} />
      ) : (
        <Input id={id} className="sp-pv" disabled={disabled} value={draft}
          type={field.kind === "date" ? "date" : field.kind === "datetime" ? "datetime-local" : field.kind === "number" ? "number" : "text"}
          aria-invalid={error ? true : undefined}
          onChange={(e) => { setDraft(e.target.value); if (field.kind === "date" || field.kind === "datetime") commit(e.target.value); }}
          onBlur={() => { if (field.kind !== "date" && field.kind !== "datetime") commit(draft); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
      )}
      {error && <p className="sp-err" role="alert">{error}</p>}
    </div>
  );
}
