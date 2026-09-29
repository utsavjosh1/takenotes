# apps/web assets

Current live assets (already in `public/` and used by the site):

- `/takenotes-symbol-violet.svg` — header, interactive preview brand mark, article byline
- `/takenotes-app-icon-light.svg` + `/takenotes-app-icon-dark.svg` — theme-aware tile favicons (light/dark via `media`)
- `/takenotes-lockup-dark.svg` + `/takenotes-lockup-light.svg` — horizontal lockups (desktop welcome + About; future dark footer/press use)
- `/takenotes-monochrome-dark.svg` + `/takenotes-monochrome-light.svg` — monochrome lockups (press/social reserve)
- `/takenotes-symbol-ink.svg` + `/takenotes-symbol-paper.svg` — bare marks (theme-specific in-app use)
- `/takenotes-wordmark-ink.svg` — wordmark only (press use)

Dummy / replaceable slots (no image files committed yet):

1. `hero-paper` and `hero-doodle` — pure CSS/SVG placeholders in `src/App.tsx`
   - Replace with a product screenshot: `public/hero-notebook.png` (1600×1000, rounded, subtle shadow)
2. `file-art` / `terminal-art` — CSS illustrations in `src/App.tsx`
   - Replace with real screenshots when the desktop UI is ready
3. Open Graph image — missing
   - Add `public/og-cover.png` (1200×630) and reference it from `index.html`
4. Favicon raster variants — only SVG today
   - Optionally add `public/favicon-32.png` and `public/apple-touch-icon.png`

Guidance:

- Prefer real product screenshots over stock imagery.
- Keep the warm paper palette (`#faf6ee`, `#191817`, `#6d5df0`, `#ffdf8e`).
- Compress raster assets before committing.
