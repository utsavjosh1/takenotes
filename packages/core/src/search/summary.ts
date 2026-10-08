/**
 * Search result summary text (Step 9, slice 6d): the single polite
 * announcement for the search panel. One line — file and match counts —
 * so screen readers hear the outcome once per settled query instead of
 * chattering per row. Pure; the panel renders it in a `role="status"`.
 */

export function searchResultSummary(fileCount: number, matchCount: number): string {
  const files = fileCount === 1 ? "1 file" : `${fileCount} files`;
  const matches = matchCount === 1 ? "1 match" : `${matchCount} matches`;
  return `${files} · ${matches}`;
}

