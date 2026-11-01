# takenotes

Local-first Markdown notes app. Notes are plain `.md` files the user owns; the app is a calm page-style editor around them, with Today/Tasks/Calendar planning views and an MCP server so agents can read and write the same files.

The reference UI lives in design/prototype/index.html. Open it in a browser to compare. Never edit or ship it.

## Stack

- Desktop: Electron 44 (`apps/desktop`: `main/`, `preload/`, `renderer/`), React 19, Tailwind 4.
- Also: `apps/web` (browser renderer), `apps/server` (host runtime + MCP over HTTP), `apps/mobile` (Expo / React Native).
- Editor: CodeMirror 6 page editor (`apps/desktop/src/renderer/editor/`). The file text is the single source of truth, so saving without edits cannot change a byte. `wysiwyg.ts` hides Markdown marks and renders tasks, chips and links in place. (TipTap was considered and dropped; `packages/core/src/markdown/blocks.ts` stays as the lossless block model.)
- Tests: Vitest (`tests/**`). Language: TypeScript, ESM, Node >=24.

## Folder map

- `packages/contracts` – IPC types, `AppError` codes. `packages/core` – pure logic: index, links, search, tasks, calendar, collections, policy. `packages/platform` – path/OS rules. `packages/ui` – design tokens (`src/theme.ts` generates `src/tokens.css`; `swatch.html` previews them).
- `packages/core/src/ports/file-store.ts` – the `FileStore` interface + `MemoryFileStore` for tests. Disk implementation: `apps/desktop/src/main/services/file-store.ts` (wraps `NoteService`: native folders and WSL, atomic writes, revision hash).
- `packages/core/src/markdown/blocks.ts` – lossless note model (`parseNote` / `serializeNote` / `editBlock`).
- `packages/core/src/index/document.ts` – the one parser for links, tags, headings, tasks (`@due @scheduled @priority`), YAML details.
- `design/prototype/` – reference prototype (HTML/JS/CSS, read-only).

## Run and test

- `npm run dev` – desktop app. `npm run dev:web` – web. `npm test` – all tests. `npm run typecheck`, `npm run lint`.
- Tokens: edit `packages/ui/src/theme.ts`, run `npm run ui:tokens`; CI runs `ui:tokens:check`.
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
