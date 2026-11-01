# takenotes

Local-first Markdown notes app. Notes are plain `.md` files the user owns; the app is a calm page-style editor around them, with Today/Tasks/Calendar planning views and an MCP server so agents can read and write the same files.

The reference UI lives in design/prototype/index.html. Open it in a browser to compare. Never edit or ship it.

## Stack

- Desktop: Electron 44 (`apps/desktop`: `main/`, `preload/`, `renderer/`), React 19.
- Also: `apps/web` (browser renderer), `apps/server` (host runtime + MCP over HTTP), `apps/mobile` (Expo / React Native).
- Editor: CodeMirror 6 page editor (`apps/desktop/src/renderer/editor/`). The file text is the single source of truth, so saving without edits cannot change a byte. `wysiwyg.ts` hides Markdown marks and renders tasks, chips and links in place. (TipTap was considered and dropped; `packages/core/src/markdown/blocks.ts` stays as the lossless block model.)
- Tests: Vitest (`tests/**`). Language: TypeScript, ESM, Node >=24.

## Folder map

- `packages/contracts` – IPC types, `AppError` codes and `ERROR_WORDS` (the plain-word text for every code, used by every app). `packages/core` – pure logic: index, links, search, tasks, calendar, collections, policy. `packages/platform` – path/OS rules. `packages/ui` – the design system (see "Design system").
- `packages/core/src/ports/file-store.ts` – the `FileStore` interface + `MemoryFileStore` for tests. Disk implementation: `apps/desktop/src/main/services/file-store.ts` (wraps `NoteService`: native folders and WSL, atomic writes, revision hash).
- `packages/core/src/markdown/blocks.ts` – lossless note model (`parseNote` / `serializeNote` / `editBlock`).
- `packages/core/src/index/document.ts` – the one parser for links, tags, headings, tasks (`@due @scheduled @priority`), YAML details.
- `design/prototype/` – reference prototype (HTML/JS/CSS, read-only).

## Run and test

- `npm run dev` – desktop app. `npm run dev:web` – web. `npm test` – all tests. `npm run typecheck`, `npm run lint`.
- Tokens: edit `packages/ui/src/theme.ts`, run `npm run ui:tokens` (writes `tokens.css` and `generated.ts`); CI runs `ui:tokens:check`.
- `npm run lint:css` – stylelint. `npm run storybook` – component examples. Tests for the design system are logic-only (no browser, no screenshots): `tests/ui/*`, `tests/web/design.test.ts`, `tests/server/web-ui.test.ts`, `tests/mobile/native-styles.test.ts`.
- Two perf-budget tests (`tests/index/scale.test.ts`, `tests/renderer/conformance.test.ts`) can miss under full-suite load; rerun them alone before treating as a regression.
- Known unrelated typecheck errors exist in `wsl/helper-client.ts`, `wsl/launch-security.ts`, `tools/mcp-sidecar/src/index.ts`.

## Rules

- Notes are plain .md files the user owns. Never invent a database for note content.
- All disk access goes through FileStore (in practice `NoteService`). Nothing else touches note files.
- Never overwrite a file that changed on disk since it was read. `write` with a stale `expectedRev` fails with CONFLICT; surface it as a conflict.
- Opening a note and saving without edits must not change a byte. Only edited blocks are regenerated; tables, `> [!info]` notes, images and `%% comments %%` are kept verbatim.
- Interface text uses plain words. Banned in the UI: backlinks, outline, properties, frontmatter, markdown, vault, wikilink. Use "Linked from", "On this page", "Details", "link to a note". (Code identifiers may keep these names.)
- Every screen needs loading, empty, error and read-only states. Errors say the cause in plain words, keep technical text in a collapsed "Details", and offer one next action.
- Keyboard accessible, visible focus, 44px touch targets on mobile, light and dark, `prefers-reduced-motion` honored. Motion 120-180 ms.
- No raw hex colors outside the token file. At most three small icon buttons in any header.
- Planning views never copy tasks into a second store; every change writes back to the note the task lives in.

## Design system

One package, `packages/ui`, serves every app. The prototype is the reference; never copy it in.

- **Tokens** live in `packages/ui/src/theme.ts` only. Use the public names (`--app --side --editor --panel --overlay --hover --selected --text --text2 --muted --faint --line --control --accent --btn --ok --warn --bad`, `--r-ctl/in/dlg/max/pill`, `--space-N`, `--z-*`, `--dur-*`, `--control-h*`). Dark is under `[data-theme="dark"]` and, when no theme is pinned, `prefers-color-scheme`. To add one: add it to `theme.ts` (a colour in both themes, then `publicColors`), run `npm run ui:tokens`, commit both generated files.
- **Components** live in `packages/ui/src/dom` (React DOM) and `packages/ui/src/native` (pure style rules for React Native; `apps/mobile/components/ui.tsx` renders them). Apps may not define their own Button, Dialog, Menu, Toast, Banner, Input, Select, Chip, Card, Tabs and so on (ESLint enforces the names). To add one: write the behaviour as pure functions in `overlays.ts`/`behavior.ts` and test them; add markup in `dom/`, styles in `dom/styles.css` using tokens only, a story in `*.stories.tsx`, and tests in `tests/ui/`.
- **Icons**: one set, `dom/icon-data.ts` (20px, 1.5px stroke, `currentColor`). Add a path there; desktop maps its names in `components/icons.tsx`.
- **Brand layer**: `apps/web/src/brand.css` is the only place raw colours are allowed outside the token files (marketing art only).
- **Never** add raw hex/rgb, `border-radius` in px, `!important` (CodeMirror and reduced-motion resets are the two documented exceptions, marked with `stylelint-disable`) or numeric `z-index` in CSS. `npm run lint:css` fails on them. Interface text stays at 12px or larger.
- **Words**: errors come from `ERROR_WORDS`; interface text must pass `tests/ui/jargon.test.ts`.
