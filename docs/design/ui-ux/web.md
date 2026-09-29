# Website and browser notebook specification

Part of the [UI/UX guide](README.md). **Separate two surfaces:** the existing public marketing site and a potential authenticated browser notebook. They share identity, not identical layouts or data guarantees.

## 1. Existing website: preserve its strengths

Implementation: [`apps/web/src/App.tsx`](../../../apps/web/src/App.tsx), [`App.css`](../../../apps/web/src/App.css), [`site-content.ts`](../../../apps/web/src/site-content.ts), and [`components/NotebookPreview.tsx`](../../../apps/web/src/components/NotebookPreview.tsx).

The visual baseline already provides:

- Paper (`#faf6ee`), ink (`#191817`), violet, and amber.
- Fraunces display headings and Inter body copy.
- A concise promise: “Less noise. More room to think.”
- Feature descriptions centered on ownership, files, writing, and WSL work in progress.
- A small interactive sample with an explicit non-persistence disclaimer.
- Early-build and unsigned-release disclosures.

Do not redesign this into a generic SaaS dashboard, add fake customer logos/statistics, or claim available mobile/sync/WSL features that are still planned or unverified.

## 2. Website page specification

| Section | User question | Required layout and behavior |
|---|---|---|
| Header | Where can I go? | Brand, short section navigation, GitHub, one download/build CTA. Responsive disclosure menu. |
| Hero | What is it, and why should I care? | One H1; short plain-language explanation; one primary build CTA, secondary preview link; Windows-first status. |
| Notebook preview | What does using it feel like? | Interactive sample with unmistakable concept/demo label and volatile-data disclosure. |
| Principles | What does it value? | Short text/icon list, not a second dense navigation bar. |
| Features | What can it actually do? | File ownership, editing/search/commands, conflict/recovery; distinguish work in progress. |
| Workflow | How would I start? | Three concrete steps: choose folder, write, organize/find. |
| Roadmap | What is ready versus planned? | Clearly labeled foundation / in progress / planned; claims tied to current evidence. |
| FAQ | What might stop me? | Files, platforms, privacy, builds, and limitations. Native details/summary behavior. |
| Download | How do I try it responsibly? | Actual releases/source destinations; platform requirements and unsigned/pre-release warning beside the CTA. |
| Footer | Where is supporting information? | Real repository/contribution/release links and truthful license/status. |

### Layout measurements

- Main max width: **1180px**; inline gutters 20px desktop, 16–20px mobile.
- Desktop section spacing: **80–88px**; mobile **48–56px**.
- Hero display size: fluid **52–116px** on large layouts; allow down to **40px** at 320px/reflow widths when necessary. Never shrink body copy to make a hero fit.
- Section headings: **40–76px** desktop, **32–44px** mobile; body 16–18px with line height 1.6–1.7.
- Cards use 20–28px radii and subtle shadows. These marketing values do not apply to desktop file rows.
- Feature grids collapse by available width; preserve meaningful reading order, not alternating CSS order disconnected from DOM order.
- Keep body-copy lines approximately 45–75 characters. Avoid long centered paragraphs and huge blank gaps between a claim and its evidence.

### Responsive behavior

Existing breakpoints are **1020px** and **760px**; retain them unless content testing justifies a change.

- `>1020`: full header nav, richer feature grids, two-column explanatory sections.
- `761–1020`: simplify grids, remove decorative hero papers/doodles, stack sections where text becomes cramped.
- `≤760`: collapse nav, stack hero actions and content sections, make all touch targets at least 48px.
- `320–390`: release badge wraps, titlebar demo label wraps, toolbars move to two rows, long headings remain inside the viewport.
- No page-wide horizontal overflow. Intentional code/demo regions may have their own labeled scroll region.

## 3. Header and mobile navigation

- Retain the skip link to main content and visible keyboard focus.
- Sticky header must not obscure anchor targets: use `scroll-margin-top` or an equivalent measured offset.
- Mobile menu is a disclosure navigation region, not an application menu role. Trigger exposes `aria-expanded`/`aria-controls` and has a 48px hit area.
- Escape closes and returns focus to trigger. Selecting a section closes the disclosure and moves focus to an appropriate visible destination or restores it predictably; never leave focus on a hidden menu link.
- A breakpoint change cannot leave hidden links in the tab order.
- Keep download/build destination labels consistent with actual availability. Do not show an App Store/Play Store button without a real release.

## 4. NotebookPreview: a demonstration with honest boundaries

The current sample uses React state and a textarea; refreshing discards edits. Keep it independent of real files, credentials, and server workspaces.

### Wide preview

- Titlebar: brand, **Interactive concept** label; any simulated caption controls remain decorative and noninteractive.
- Sidebar: sample workspace, sample-note search, note list.
- Content: note identity, Write/Read toggle, theme/reset actions, reading or text-editing surface.
- Footer: sample-only persistence state, word count, Markdown label.
- The global caption states: **Interactive design preview, not the desktop app. Edits stay in this tab and disappear on refresh.**

### Narrow preview (`≤760px`)

Target adjustment from current stacking behavior:

1. Replace the full-height sidebar with a labeled **Choose sample note** selector and a compact **Search samples** disclosure.
2. Keep note picker and mode controls usable without scrolling through the entire sample list first.
3. Search/picker controls must not duplicate the same expanded note list in two places. Provide access to the filtered list inside the disclosure.
4. Theme and reset have 48px touch hit areas and accessible names; toolbar wraps before labels truncate.
5. Reading body uses 16px default text, 20px gutters; sample textarea uses at least 16px on touch browsers and a bounded initial height with usable scrolling.
6. Keep “Nothing is saved” visible even when secondary word count is omitted.

### Demo interactions

- Editing: status changes to **Demo edit only · refresh clears changes**; never “Saved.”
- Write/Read toggling retains sample edits and active selection; theme toggling does not reset notes.
- Reset with changed sample text asks **Reset sample notes? Your demo edits will be cleared.** Keep a cancel path; default focus is safe.
- Search has a dedicated no-results state; active note can remain visible when absent from filtered results.
- The reading view renders text safely; current small renderer is not a production Markdown parser and must not be advertised as one.
- Decorative folders and faux window controls must not look like functional commands. Remove them or clearly keep them outside the interactive/accessibility surface.
- Mark preview heading hierarchy meaningfully without introducing a second page H1.

## 5. Website visual/accessibility hardening

Before treating the reference as production-ready:

- Replace low-contrast functional muted text and necessary control borders with the semantic values in [foundations](foundations.md); retain softer tones for decoration only.
- Add consistent `:focus-visible` styling for links, buttons, summary, selectors, and the sample input. The current sample search removes its input outline, so its wrapper needs a visible focus-within treatment.
- Increase small icon/menu controls to 48px touch targets without changing the perceived icon scale.
- Ensure the dark preview covers all descendants: mode controls, empty search state, labels, fields, dividers, icons, selection, blockquotes, and status—not only the main surfaces.
- Reserve image dimensions; avoid layout shift during font loading. Self-host appropriately licensed fonts or use fallbacks; do not copy remote font `@import` into desktop/mobile.
- Respect reduced motion for smooth scroll, blinking terminal cursor, transitions, and decorative effects. Avoid infinite animation that competes with reading.
- Review assets against [`apps/web/ASSETS.md`](../../../apps/web/ASSETS.md). Real screenshots must name their build/platform; concept images stay labeled as concepts. Add meaningful social preview metadata when the asset exists, not a broken placeholder URL.

## 6. Future browser notebook — separate implementation gate

**Not implemented by the landing-page preview.** If added, put a real workspace application behind an explicitly designed route/application boundary; preserve the public site's root page. Example `/app` is a proposal, not an existing route contract.

### Browser shell

- Wide: use desktop's Files/Search sidebar, document area, and status semantics **without** Electron drag regions, fake native caption controls, or desktop install/update UI.
- Compact: use mobile-style single-pane navigation with a visible note list/back path. Keep browser history meaningful.
- Do not place marketing hero content, feature cards, or floating download CTAs inside an editing session.
- Share tokens and applicable DOM primitives, not the entire marketing `App.css` cascade or Electron components requiring preload.

### Workspace access and honesty

A browser does not automatically have arbitrary filesystem/WSL access. Choose and label an implemented mode:

| Mode | Honest copy and constraints |
|---|---|
| Authenticated remote workspace | Show host/location and session status. “Saved to server” only after successful revision-checked write. |
| Browser file-provider access, if supported | Feature-detect permission APIs; explain permission lifetime and revocation. No claim of cross-browser parity without tests. |
| Imported Markdown copy | Say “Imported copy.” Saving/exporting a download is not updating the source file. |
| Sample/demo | Say “Nothing is saved.” No credentials, no real-workspace claims. |

### Navigation and persistence

- URL identity uses stable opaque identifiers or safely encoded app-level identifiers, not raw absolute paths, tokens, or credentials. Authorization must still be checked on every load.
- Back/forward restores workspace/note selection where authorized; navigation guards handle unsaved state. A `beforeunload` warning is best-effort, not durable storage.
- Session expiry retains accessible local draft content where implemented and prompts reauthentication; it does not silently clear the editor or move user data into a different account.
- Offline status is separate from local-draft durability. Do not display “Offline ready” unless assets, drafts, recovery, and later revision-safe reconciliation have been tested.
- Respect browser-reserved shortcuts. Quick-open/palette always has an on-screen/menu alternative; do not blindly copy Electron's Ctrl+P/Ctrl+W binding behavior into a browser.
- Server-hosted workspace data follows the established security model. This design guide does not authorize exposing a host endpoint publicly.

## 7. Web acceptance

- Current site works at 320, 390, 768, 1024, and 1440 CSS px, including 200% zoom and reduced motion.
- Keyboard-only users can navigate sections, operate the sample, switch modes/themes, search, reset, and reach releases.
- Preview claims remain sample-specific before and after edits; refresh visibly returns to sample defaults.
- Light/dark sample states meet contrast and focus requirements; touch controls are not 34px inherited desktop targets.
- No fabricated product availability, platform support, persistence, customer evidence, or download destination.
- A future browser notebook cannot pass based on the demo's visual tests; it needs real auth, file access, conflict, session expiry, and durability evidence.
