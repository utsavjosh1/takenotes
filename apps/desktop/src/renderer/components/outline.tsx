/** Step 2 Outline pane (live ATX parse) + shared hover PreviewCard. */
import { useRef, useState, type JSX } from "react";
import { moveRovingIndex } from "@takenotes/ui";
import { EmptyState } from "@takenotes/ui/dom";
import { extractAtxHeadings } from "@takenotes/core/outline/extract";

export function OutlinePane({
  content,
  onNavigate,
}: {
  content: string | null;
  onNavigate: (line: number) => void;
}): JSX.Element {
  const listRef = useRef<HTMLDivElement>(null);
  // Step 9 roving tabindex: one Tab stop for the whole outline; arrows
  // move focus only (no scroll-jank while browsing), Enter navigates.
  const [focused, setFocused] = useState(0);
  if (content === null) {
    return <EmptyState title="No note open" description="Open a note to see its headings." />;
  }
  const headings = extractAtxHeadings(content);
  if (headings.length === 0) {
    return <EmptyState title="No headings" description="Headings you add here show up automatically." />;
  }
  const at = Math.min(focused, headings.length - 1);
  return (
    <div
      ref={listRef}
      role="tree"
      aria-label="Outline"
      onKeyDown={(e) => {
        const next = moveRovingIndex(at, headings.length, e.key, "vertical");
        if (next === null) return;
        e.preventDefault();
        setFocused(next);
        listRef.current?.querySelector<HTMLElement>(`[data-outline-idx="${next}"]`)?.focus();
      }}
    >
      {headings.map((h, i) => (
        <div key={`${h.line}:${h.anchor}`} role="treeitem" aria-selected={i === at} className="tree-row" style={{ paddingLeft: 12 + (h.level - 1) * 12 }} title={h.text}>
          <button
            className="row-label"
            data-outline-idx={i}
            tabIndex={i === at ? 0 : -1}
            onFocus={() => setFocused(i)}
            onClick={() => { setFocused(i); onNavigate(h.line); }}
          >
            {h.text}
          </button>
        </div>
      ))}
    </div>
  );
}

/** Hover preview card: rendered excerpt + full-path footer (disambiguation). */
export function PreviewCard({ html, fullPath, x, y }: { html: string; fullPath: string; x: number; y: number }): JSX.Element {
  const left = Math.max(8, Math.min(x, window.innerWidth - 330));
  const top = Math.max(8, Math.min(y + 16, window.innerHeight - 240));
  return (
    <div className="hover-preview" role="tooltip" style={{ left, top }}>
      <div className="hover-preview-body" dangerouslySetInnerHTML={{ __html: html }} />
      <div className="hover-preview-path" title={fullPath}>{fullPath}</div>
    </div>
  );
}
