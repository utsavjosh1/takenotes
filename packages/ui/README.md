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
