# M4: apps/web (marketing site)

Logic-only verification (`tests/web/design.test.ts`); no screenshots.

| Area | Before | After | On purpose / undone |
| --- | --- | --- | --- |
| Palette | Own `--paper/--ink/--violet/...` in 3 files, 84 distinct hex values | Product tokens (`--app`, `--text`, `--accent`, ...). Raw colours only in `src/brand.css` (illustration art, fixed-dark download card, mock window greys) | Accent is now `#4f41d6`, not the brighter `#6d5df0`, for readable text |
| Radii | 12-34px | 4/6/8/10px and pills | Cards and the mock window are visibly less round |
| Buttons | `.button*`, `.icon-button` local | Shared `tn-button` (links too) and `IconButton`; theme toggle and menu toggle use `IconButton` | Header "Download" button is 30px, was 40px |
| Type | Inter + Fraunces + Caveat | System UI font for interface text; Fraunces and Caveat stay as `--brand-font-*` | Inter no longer loaded. Body text is a little narrower |
| Sizes | 10-15px mix | 12/13/14/16 | 12px floor |
| Notebook preview | Own light/dark variable sets | `data-theme` on the element, so product tokens resolve for it | |
| Shadows | Two warm shadows | `--shadow` | |
| z-index | 1, 2, 30, 60, 100 | Token scale | |

Left undone: the marketing copy still says "Markdown" where it names the file format (allowed for marketing; the ban covers product interface text). `!important` remains in the reduced-motion reset and the theme-reveal transition (M6 documents them as exceptions).
