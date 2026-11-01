# @takenotes/ui

Shared design tokens and interaction contracts. Platform adapters render them.

## Entries

- `.` (`src/index.ts`) — platform-neutral: `theme.ts` values + `behavior.ts`
  contracts. Safe for DOM, native, and Node tests. Never imports React DOM
  or browser globals.
- `./native` (`src/native/index.ts`) — same neutral modules through an
  explicit native seam. Future Expo controls (`Button`, `Notice`, …) map
  these variants/tones to React Native components with `targetSize.touch`
  hit areas. Same blocked/pending/dismissal rules as DOM.
- `./dom` (`src/dom/`) — React DOM adapters (`Button`, `IconButton`,
  `TextField`, `SelectField`, `SettingRow`, `Notice`, `EmptyState`,
  `Dialog`) + `dom.css`. Desktop-only; never imported by mobile.
- `./tokens.css` — generated from `src/theme.ts`. Run `npm run ui:tokens`;
  never edit by hand. CI checks with `npm run ui:tokens:check`.

## Rules

- Tokens and behavior stay in the neutral modules. Adapters own only
  rendering, focus, and platform events.
- Operations stay in callers: components render supplied state and emit
  intent; they never infer success or touch the filesystem.
- Dialog dismissal defaults to safe: backdrop never confirms a destructive
  decision (`closeOnBackdrop: false`).

## Tokens

One source: `src/theme.ts`. `npm run ui:tokens` writes `src/tokens.css`;
CI runs `ui:tokens:check`. Use the **public names** below in new code. The
values are written per theme, so a subtree with its own `data-theme` re-resolves.

| Public name | Light | Dark | Use |
| --- | --- | --- | --- |
| `--app` `--side` `--editor` `--panel` `--overlay` | see `theme.ts` | | Window, sidebar/rail/bars, page + inputs, cards, menus/dialogs |
| `--hover` `--selected` `--code` `--highlight` | | | Hover, selected row/tab, code, search match |
| `--text` `--text2` `--muted` `--faint` | | | Text, from main to placeholder |
| `--line` `--control` | | | Borders; input and checkbox borders |
| `--accent` `--accent-soft` `--accent-hover` `--on-accent` | | | Links, focus, active; user-changeable |
| `--btn` `--btn-text` | | | Primary button |
| `--ok` `--warn` `--bad` (+ `-bg`) | | | Success, warning, error |
| `--shadow` | | | Menus and dialogs |
| `--r-ctl` `--r-in` `--r-dlg` `--r-max` `--r-pill` | 4 6 8 10 99 | | Radii. Nothing rounder than 10 except pills |
| `--measure` `--sb` `--rp` `--rail` `--titlebar-h` `--statusbar-h` `--tabstrip-h` | 760 248 300 48 40 26 36 | | Layout |
| `--control-h` `-sm` `-lg` `-touch` `-icon` | 30 26 36 44 28 | | Control heights. Touch and `apps/mobile` use 44 |
| `--fs` `--lh` `--fs-ui` `--lh-ui` `--fs-small` `--fs-title` | 16 1.7 14 1.45 12 34 | | Note body (user-adjustable) and UI type |
| `--dur-1/2/3` `--ease-out` | 120 150 180ms | 0ms with reduced motion | Motion |
| `--z-base` ... `--z-tooltip` | 0 10 100 200 300 400 500 600 | | One stacking scale |

Dark values apply under `[data-theme="dark"]` and, when no theme is pinned,
under `prefers-color-scheme: dark`.

Known deviation: `--muted` in light mode is `#6c6558`, not the guide's
`#70695c`, to keep 4.5:1 on hover surfaces (`tests/ui/contrast.test.ts`).

### Theme and accent

`@takenotes/ui/dom` exports `setTheme('system' | 'light' | 'dark')`,
`setAccent(hex | null)` and `initTheme()`. `setAccent` derives hover, soft and
on-accent, and refuses (returns `false`, keeps the default) a colour below
4.5:1 on the editor surface in the active theme. Pure maths
(`deriveAccent`, `contrastRatio`) is in the neutral entry for native and tests.

### Add a token

1. Add the value to `theme.ts` (a colour key in both themes, or a scale).
2. If it needs a public name, add it to `publicColors` or the matching scale.
3. `npm run ui:tokens`, commit `tokens.css`, run `npx vitest run tests/ui`.
