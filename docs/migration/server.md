# M4: apps/server (browser page)

No screenshots: verification is logic-only (`tests/server/web-ui.test.ts`).

| Screen / state | Before | After | Chosen on purpose / left undone |
| --- | --- | --- | --- |
| Log in | Unstyled input + button, "Login failed." in a pink box | Card, labelled field, red message under the field, real form (Enter submits) | Wrong password is now field-level, not a banner |
| Log in: offline | Fetch threw, nothing shown | Danger banner "Can't reach the server." with Details and Try again | New state |
| Session ended | Message in the login error box | Warn banner "Your session ended." | |
| Workspace | Bare select | Card, label, skeleton while loading, empty state, error banner | New loading/empty/error states |
| Note | `Open failed: NOT_FOUND`, `CONFLICT: ...` text | Plain-word banners, code only in collapsed Details; conflict banner has "Reload latest" | Revision hash no longer shown |
| AI agents | "Agents (MCP)", "tokens", "scope", raw table | "AI agents", "access keys", Read only / Can edit, shared table, Revoked badge | Name is now required (field error); previously an empty name went to the server |
| Revoke | One click, immediate | Confirm dialog (native `<dialog>`), Cancel focused, red confirm | New confirm step |
| Theme | Light only | Follows the system (light/dark) via shared tokens | |

Left undone: read-only state (no read-only mode exists on this page); no copy button on the new access key (new feature, not part of the migration); dark/light toggle (system only).

Mechanics: `packages/ui/src/generated.ts` (built by `npm run ui:tokens`, checked by `ui:tokens:check`) carries the token and component CSS as strings, because the server bundles to one CJS file with no stylesheet imports.
