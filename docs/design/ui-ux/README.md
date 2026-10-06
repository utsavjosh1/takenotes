# takenotes UI/UX design guide

**Status: proposed implementation specification.** This guide describes the target experience; it is not a claim that the interfaces or capabilities below already ship.

**Visual reference:** [`apps/web/src/App.css`](../../../apps/web/src/App.css) and [`NotebookPreview.tsx`](../../../apps/web/src/components/NotebookPreview.tsx). **Scope:** desktop notebook, future mobile notebook, current public website, and a separately gated browser notebook.

## Read in this order

| Document | Implementation responsibility |
|---|---|
| [Foundations](foundations.md) | Brand, semantic light/dark tokens, typography, spacing, density, accessibility |
| [Components and interaction states](components-and-states.md) | Buttons, fields, navigation, overlays, editing, saving, recovery, error copy |
| [Desktop](desktop.md) | Electron shell, workspace setup, files/search, tabs/splits, editor, settings |
| [Mobile](mobile.md) | Touch navigation, phone/tablet layouts, keyboard, storage/lifecycle gates |
| [Web](web.md) | Marketing sections, responsive concept preview, future browser workspace |
| [Implementation and acceptance](implementation.md) | Existing code owners, staged delivery, test scenarios, completion gates |

Start with this page before implementing an individual screen. Each platform document uses the same component and state contracts rather than inventing its own save, selection, or error behavior.

## 1. The experience in one sentence

**A warm, quiet writing space where files are understandable, actions are predictable, and the state of your work is never ambiguous.**

“Clean” does not mean hiding important controls, making text pale, shrinking targets, or removing safety messages. It means a clear hierarchy and fewer competing elements.

### The first five seconds

A user should be able to answer:

1. Which workspace am I in, and where do its files live?
2. Which note am I viewing or editing?
3. Are my latest changes saved to the file, retained as a draft, or only in memory?
4. How do I find another note or create one?
5. If something failed, what can I safely do next?

If decoration or density makes these harder to answer, remove it.

## 2. What the repository contains today

These observations come from the working tree inspected for this guide, not from historical screenshots.

| Surface | Existing implementation | Consequence for this guide |
|---|---|---|
| Desktop | `apps/desktop/src/renderer/`: React, CodeMirror, files/search rail, tabs/panes, settings, WSL and recovery UI | Improve the real workflows incrementally. Do not replace them with the website demo. |
| Public web | `apps/web/src/`: landing page, sample-note preview, local component state | Preserve its explicit “nothing is saved” disclosure. It is the visual reference, not the data architecture. |
| Mobile | `apps/mobile/src/App.tsx` returns `null`; README defers Expo/native dependencies | All mobile screens below are target designs. Storage, editor, navigation, and native dependencies require implementation gates. |
| Shared UI | `packages/ui/src/tokens.css` currently contains only two radii and four spacing tokens | Shared theme colors, type, components, and React Native theme objects do not yet exist. |
| Theme definitions | Desktop has its own light/dark tokens; website has a separate paper palette | Consolidate semantic values without importing website-wide styles into Electron. |
| Server | Separate `apps/server/` application | An authenticated server is not proof that browser/mobile persistence and offline flows are ready. |

### Capability honesty

- Windows-first desktop and WSL validation disclosures remain visible where relevant.
- No visual “Synced,” “Backed up,” “Offline ready,” or “Secure connection” badge without evidence for that exact assertion.
- A persisted recovery draft is not the same as saving the Markdown file.
- Future Daily Notes, Today, tasks, calendar, Collections, sync, and mobile builds are not navigation destinations until functional.
- WSL host/runtime implementation is governed by its own architecture work. This guide does not approve a new transport or authentication model.

## 3. Translate the website, do not copy the website

| Keep from `apps/web/` | Adapt for working applications | Leave on the marketing site |
|---|---|---|
| Warm cream surfaces and dark ink | Flatter panels and denser rows | Radial background gradients |
| Restrained violet identity | Violet for focus, links, and selected states | Giant serif hero headings |
| Paper-like reading surface | Borderless editor with readable line length | Tilted paper illustrations and doodles |
| Friendly sentence-case copy | Precise operational labels and errors | Promotional slogans in persistent chrome |
| Soft corners | 8px controls / 16px overlays, not pills everywhere | Large card shadows on every section |
| Care around ownership and unfinished ideas | Explicit revision, draft, and host state | Simulated window controls in a real application |

A notebook screen is not a dashboard of cards. The note is the main surface. Navigation belongs beside it on desktop, and one step away on a phone.

## 4. Non-negotiable design rules

1. **Content before chrome.** Use one main editing/reading surface. Avoid nested cards, ornamental toolbars, and a permanent formatting ribbon.
2. **One primary action per decision area.** A workspace dialog can have “Open workspace”; every toolbar button must not look primary.
3. **Stable geometry.** Loading, save success, and hover do not move the editor or change row widths.
4. **Color supports meaning.** Selected, focused, unsaved, disconnected, and destructive states also have text, shape, or icons.
5. **Progressive disclosure without hidden essentials.** Rename and less frequent commands can live in menus. Save status, search, create, and navigation must be discoverable without hover.
6. **Native interaction, shared identity.** Desktop uses keyboard/menu conventions; mobile uses touch/back/sheets; browser respects history and browser shortcuts.
7. **Failure preserves agency.** Keep text visible, describe the actual persistence state, and provide an actionable next step.
8. **No speculative controls.** Unsupported actions are omitted, or explained at the relevant setup boundary; do not fill the shell with disabled future features.
9. **Accessibility is a shipping requirement.** Focus, contrast, zoom, screen readers, and reduced motion are tested, not inferred from a screenshot.
10. **Theme changes do not change documents.** Typography/theme/density changes must not save, rewrite, or discard note content.

## 5. Common information architecture

Use the existing project vocabulary in labels:

- **Workspace:** the selected collection of files at a known location; show its display name and host/location details when needed.
- **Files:** the filesystem hierarchy. A note is a file, not an opaque card inside an application database.
- **Search:** filename/content search in the active workspace. Quick open is a separate, fast filename-oriented action.
- **Editor:** the active note and its save state. A reading view is optional future work where absent.
- **Settings:** appearance, editor preferences, file behavior, keyboard reference, and about/update information.

Do not rename Workspace to Vault, Notebook, or Base in functional UI. The public website may use “notebook” descriptively, but its demo labels should say “Sample workspace” at the data boundary.

## 6. Authority and adoption

This is the target **visual and interaction** specification. Once a migration slice is implemented, its values replace conflicting legacy visual guidance in `docs/design/layout.md`, `tokens.md`, and related short notes. Until then, those files describe the earlier UI. Keep a slice-level record in [implementation.md](implementation.md); do not pretend the migration is complete.

This guide does **not** supersede filesystem safety, revision/conflict rules, platform capability checks, accepted architecture decisions, or release evidence. If a proposed interaction needs a new capability—such as durable mobile drafts or browser access to a workspace—implement and verify that capability before enabling the interaction.

No new runtime dependency is required merely to adopt the visual design. See the existing [client stack note](../client-stack-state-validation-ui.md) for dependency direction, not a mandate to install every suggested library.
