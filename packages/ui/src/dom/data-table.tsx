import type { KeyboardEvent, ReactNode } from "react";

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** CSS width, e.g. "120px". Cells truncate with an ellipsis. */
  width?: string;
};
export type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Accessible table name. */
  label: string;
  /** Makes rows clickable and keyboard-activatable (Enter or Space). */
  onRowActivate?: (row: T) => void;
  className?: string;
};

/** 13px table, sticky header, hover row. Empty and loading states are the
 * caller's job (EmptyState, Skeleton): this renders only when there are rows. */
export function DataTable<T>({ columns, rows, rowKey, label, onRowActivate, className = "" }: DataTableProps<T>) {
  const onKey = (e: KeyboardEvent, row: T) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowActivate?.(row); }
  };
  return <div className={`ui-table-wrap ${className}`}>
    <table className="ui-table" aria-label={label}>
      <thead><tr>{columns.map((c) => <th key={c.key} scope="col" style={c.width ? { inlineSize: c.width } : undefined}>{c.header}</th>)}</tr></thead>
      <tbody>
        {rows.map((row) => <tr key={rowKey(row)} className={onRowActivate ? "ui-row--action" : undefined}
          tabIndex={onRowActivate ? 0 : undefined} onClick={onRowActivate && (() => onRowActivate(row))}
          onKeyDown={onRowActivate && ((e) => onKey(e, row))}>
          {columns.map((c) => <td key={c.key}>{c.render(row)}</td>)}
        </tr>)}
      </tbody>
    </table>
  </div>;
}
