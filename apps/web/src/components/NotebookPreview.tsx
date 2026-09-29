import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import { useSiteTheme, type Theme } from "../theme";
import { sampleNotes, type DemoNote } from "../site-content";
import { renderMarkdown } from "@takenotes/core/markdown/render";

/** Normal Markdown reading view: same safe renderer as the desktop app.
 * `renderMarkdown` escapes raw HTML and neutralizes hostile schemes, so
 * `dangerouslySetInnerHTML` here never interprets author HTML — it only
 * renders headings, code fences, tables, lists, links, and emphasis
 * (e.g. docs/README.md) instead of showing raw `#`, ```, `|` markers. */
export function NoteReadingView({ text }: { text: string }) {
  const html = useMemo(() => renderMarkdown(text).html, [text]);
  return <div className="note-prose" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function NotebookPreview() {
  const [notes, setNotes] = useState<readonly DemoNote[]>(sampleNotes);
  const [activeId, setActiveId] = useState("welcome");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const siteTheme = useSiteTheme();
  const [previewTheme, setPreviewTheme] = useState<Theme | null>(null);
  const dark = (previewTheme ?? siteTheme) === "dark";
  const [status, setStatus] = useState("Sample workspace · nothing is saved");
  const active = notes.find((note) => note.id === activeId) ?? sampleNotes[0]!;
  const filtered = notes.filter((note) => `${note.title} ${note.body}`.toLowerCase().includes(query.toLowerCase().trim()));
  const wordCount = active.body.trim().split(/\s+/).filter(Boolean).length;

  function selectNote(id: string) {
    setActiveId(id);
    setStatus("Sample workspace · nothing is saved");
  }

  function reset() {
    setNotes(sampleNotes);
    setActiveId("welcome");
    setQuery("");
    setEditing(false);
    setStatus("Sample notes restored");
  }

  return (
    <div className={`notebook ${dark ? "notebook-dark" : ""}`}>
      <div className="notebook-titlebar">
        <div className="notebook-brand"><img src="/takenotes-symbol-violet.svg" alt="" width="23" height="23" />takenotes<span className="titlebar-divider" />My little corner</div>
        <span className="demo-label">Interactive concept</span>
        <div className="notebook-window-controls" aria-hidden="true"><span>−</span><span>□</span><span>×</span></div>
      </div>
      <div className="notebook-layout">
        <aside className="notebook-sidebar" aria-label="Sample notes">
          <div className="workspace-name"><span className="workspace-avatar">M</span><div>My notebook<small>A space for everything</small></div></div>
          <label className="demo-search"><Icon name="search" size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a thought…" aria-label="Search sample notes" /></label>
          <div className="sidebar-section-label">YOUR WORKSPACE <Icon name="folder" size={13} /></div>
          <div className="demo-note-list">
            {filtered.map((note) => <button key={note.id} type="button" className={`demo-note ${note.id === active.id ? "selected" : ""}`} aria-pressed={note.id === active.id} onClick={() => selectNote(note.id)}><Icon name="file" size={16} /><span>{note.title}</span><span className="file-extension">.md</span></button>)}
            {filtered.length === 0 && <p className="demo-no-results" role="status">No matching notes. Try another word.</p>}
          </div>
          <div className="sidebar-folder"><Icon name="folder" size={15} /> Projects<span>1</span></div>
          <div className="sidebar-folder"><Icon name="folder" size={15} /> Reading<span>1</span></div>
          <div className="sidebar-bottom"><span className="status-dot" /><span>Local by nature.<small>Yours by default.</small></span><Icon name="lock" size={15} /></div>
        </aside>
        <div className="notebook-content">
          <div className="note-toolbar">
            <div className="note-breadcrumb"><Icon name="file" size={14} /><span>{active.title}.md</span></div>
            <label className="mobile-note-picker"><span className="sr-only">Choose sample note</span><select value={active.id} onChange={(event) => selectNote(event.target.value)}>{notes.map((note) => <option key={note.id} value={note.id}>{note.title}</option>)}</select></label>
            <div className="note-tools">
              <div className="view-toggle" role="group" aria-label="Note view"><button type="button" aria-pressed={editing} onClick={() => setEditing(true)}>Write</button><button type="button" aria-pressed={!editing} onClick={() => setEditing(false)}>Read</button></div>
              <button className="icon-button" type="button" aria-label={dark ? "Use light preview" : "Use dark preview"} onClick={() => setPreviewTheme(dark ? "light" : "dark")} title="Toggle preview theme"><Icon name={dark ? "sun" : "moon"} size={17} /></button>
              <button className="icon-button" type="button" aria-label="Reset sample notes" onClick={reset} title="Reset sample notes"><Icon name="reset" size={16} /></button>
            </div>
          </div>
          <div className="note-page">
            <div className="note-category"><span className="tiny-star" aria-hidden="true">✳</span> A NOTE TO YOURSELF <span> / {active.folder}</span></div>
            {editing ? <textarea className="demo-editor" aria-label={`Edit ${active.title}`} spellCheck={false} value={active.body} onChange={(event) => {
              const body = event.target.value;
              setNotes((current) => current.map((note) => note.id === active.id ? { ...note, body } : note));
              setStatus("Demo edit only · refresh clears changes");
            }} /> : <NoteReadingView text={active.body} />}
          </div>
          <div className="notebook-status"><span role="status">{status}</span><span>{wordCount} words <span className="status-separator">·</span> Markdown</span></div>
        </div>
      </div>
    </div>
  );
}
