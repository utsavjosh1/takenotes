/** Step 2 Outline pane (live ATX parse) + shared hover PreviewCard. */
import type { JSX } from "react";
import { EmptyState } from "@takenotes/ui/dom";
import { extractAtxHeadings } from "@takenotes/core/outline/extract";

export function OutlinePane({
  content,
  onNavigate,
}: {
  content: string | null;
  onNavigate: (line: number) => void;
}): JSX.Element {
  if (content === null) {
    return <EmptyState title="No note open" description="Open a note to see its headings." />;
  }
  const headings = extractAtxHeadings(content);
  if (headings.length === 0) {
    return <EmptyState title="No headings" description="Headings you add here show up automatically." />;
  }
  return (
    <div role="tree" aria-label="Outline">
      {headings.map((h) => (
        <div key={`${h.line}:${h.anchor}`} role="treeitem" className="tree-row" style={{ paddingLeft: 12 + (h.level - 1) * 12 }} title={h.text}>
          <button className="row-label" onClick={() => onNavigate(h.line)}>
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
