# takenotes website

Public marketing site and journal, built with React + Vite. The interactive notebook is a concept preview, not a connected workspace; its edits are not persisted.

## Run and verify

From the repository root:

```bash
npm run dev:web
npm --workspace @takenotes/web run build
npm run typecheck
npx eslint apps/web/src tests/web
npx vitest run tests/web/site.test.ts
```

Development: `http://127.0.0.1:5174`. Production output: `dist/web/`.

## Journal

- Listing: `/#/blog`
- Article: `/#/blog/your-notes-are-files`
- Article section: `/#/blog/your-notes-are-files?section=2`

Hash routing intentionally supports direct links and refresh on static hosts without server rewrite rules or a new routing dependency. Home section links (`#features`, `#faq`, `#download`) still work from article pages. Missing article links show a recovery page. These client-rendered hash pages do not provide separately prerendered article metadata for social crawlers; add prerendered paths if that becomes a publishing requirement.

Add/edit posts in `src/blog-content.ts`. Each post has a unique lowercase hyphenated slug, category, title, excerpt, illustration label/icon, and structured sections. Reading time is calculated from content. Content is rendered as text, not injected HTML. The initial three posts are editorial project notes, not dated release announcements.

## Theme

- First visit follows `prefers-color-scheme`.
- The header sun/moon button stores an explicit preference in `localStorage` under `takenotes.web.theme`.
- A small head script resolves the theme before first paint. Keep its storage key/palette values consistent with `src/theme.ts`.
- OS changes are followed until the user chooses a theme; clearing the storage preference restores system behavior. Preference changes synchronize across tabs.
- View Transition support produces a circular reveal from the toggle. Other browsers use CSS color transitions. Reduced-motion users receive an immediate change.
- If storage is denied, the toggle still works for that session.
- The notebook concept follows the site theme until its own preview-only toggle is used.

`src/theme.css` owns website dark/light adaptations and transitions; `src/blog.css` owns journal layouts. Existing marketing composition remains in `src/App.css`.

## Manual browser checks

1. Open the landing page, journal, an article, and an article-section permalink directly; refresh each.
2. Navigate between articles and home sections, then use browser Back/Forward.
3. Filter categories, open a story, and recover from an unknown article link.
4. Toggle both themes, refresh, and inspect landing-page cards, preview controls, article text, and footer.
5. With no stored preference, change OS theme; with an explicit preference, verify OS changes do not override it.
6. Test reduced motion, blocked storage, and a browser without View Transitions.
7. At 320, 390, 768, 1024, and 1440px, check horizontal overflow, navigation, keyboard focus, and touch targets.
8. Use the skip link and article section links with a keyboard; focus should reach visible content without leaving the article route.
