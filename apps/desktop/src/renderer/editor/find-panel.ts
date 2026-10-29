import {
  closeSearchPanel, findNext, findPrevious, getSearchQuery, replaceAll, replaceNext, SearchQuery, setSearchQuery,
} from "@codemirror/search";
import type { EditorView, Panel, ViewUpdate } from "@codemirror/view";

/** Find bar under the tabs: find field with "1 of 4", previous/next, replace field, Replace, Replace all, close. */
export function createFindPanel(view: EditorView): Panel {
  const dom = document.createElement("div");
  dom.className = "find-bar";
  dom.setAttribute("role", "search");
  dom.innerHTML = `
    <input class="find-in" name="search" placeholder="Find" aria-label="Find in note" spellcheck="false">
    <span class="find-count" aria-live="polite"></span>
    <button type="button" class="find-btn" data-a="prev" aria-label="Previous match" title="Previous (Shift+Enter)">↑</button>
    <button type="button" class="find-btn" data-a="next" aria-label="Next match" title="Next (Enter)">↓</button>
    <input class="find-in" name="replace" placeholder="Replace" aria-label="Replace with" spellcheck="false">
    <button type="button" class="find-btn wide" data-a="rep">Replace</button>
    <button type="button" class="find-btn wide" data-a="all">Replace all</button>
    <button type="button" class="find-btn" data-a="close" aria-label="Close find">✕</button>`;
  const find = dom.querySelector<HTMLInputElement>('input[name="search"]')!;
  const repl = dom.querySelector<HTMLInputElement>('input[name="replace"]')!;
  const count = dom.querySelector<HTMLElement>(".find-count")!;

  const commit = (): void => {
    const q = new SearchQuery({ search: find.value, replace: repl.value });
    if (!q.eq(getSearchQuery(view.state))) view.dispatch({ effects: setSearchQuery.of(q) });
  };
  const tally = (): void => {
    const q = getSearchQuery(view.state);
    if (!q.search || !q.valid) { count.textContent = ""; return; }
    const sel = view.state.selection.main;
    let total = 0, current = 0;
    const cursor = q.getCursor(view.state);
    for (let r = cursor.next(); !r.done; r = cursor.next()) {
      total++;
      if (r.value.from === sel.from && r.value.to === sel.to) current = total;
    }
    count.textContent = total === 0 ? "No matches" : `${current || 1} of ${total}`;
  };
  find.addEventListener("input", () => { commit(); tally(); });
  repl.addEventListener("input", commit);
  dom.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>("[data-a]")?.dataset.a;
    if (!a) return;
    commit();
    if (a === "next") findNext(view);
    else if (a === "prev") findPrevious(view);
    else if (a === "rep") replaceNext(view);
    else if (a === "all") replaceAll(view);
    else { closeSearchPanel(view); view.focus(); }
    tally();
  });
  dom.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeSearchPanel(view); view.focus(); }
    else if (e.key === "Enter" && e.target === find) { e.preventDefault(); commit(); (e.shiftKey ? findPrevious : findNext)(view); tally(); }
    else if (e.key === "Enter" && e.target === repl) { e.preventDefault(); commit(); replaceNext(view); tally(); }
  });
  return {
    dom,
    top: true,
    mount: () => { find.focus(); find.select(); tally(); },
    update(u: ViewUpdate) {
      const q = getSearchQuery(u.state).search;
      if (find.value !== q) find.value = q;
      tally();
    },
  };
}
