# Takenote Meaningful Design

## Status

Branch: `skill/takenote-meaningful-design` (cut from `design/takenotes-ux-improvements`, carries its 2 dirty files forward — do not merge until UX work lands).
Goal: a repo-local skill that makes every pixel earn its place and every flow effortless, so we can design Takenote like the best note apps without cloning them.

## What was researched

| Source | File | Lesson for the skill |
|---|---|---|
| Takenote principles | `docs/design/principles.md` | The one-line test: "Does this help the user find a note, understand where they are, or continue writing?" Editor is the product, everything else supports it. |
| Target UX spec | `docs/design/ui-ux/README.md` + `foundations.md` + `desktop.md` | Warm paper, quiet chrome, content-before-chrome, one primary action, stable geometry, color-supports-meaning, no speculative controls, a11y is shipping. `--tn-*` semantic tokens. |
| Interactions / states | `docs/design/interactions.md`, `states.md` | Hover = bg shift only. Save = status text, never toast spam. Conflict = calm bar. Toasts only for failure/trash/disconnect. |
| Obsidian (current) | `docs/research/OBSIDIAN_FEATURES_CURRENT.md` | Vault = plain folder + metadata index (links, backlinks, tags, properties, search). Rename updates links. File explorer + Quick open + Command palette + Daily Notes + recovery + keyboard-first. Lesson: **index over files, never instead of files**. |
| App reality | `apps/desktop/src/renderer/App.tsx` (1585 lines), `components/`, `packages/ui` | Single-surface WYSIWYG Markdown (ADR-0015, no read/edit toggle), tabs/panes, Today/Calendar/Collections/Graph/Canvas panes, WSL flows. Risk: pane sprawl — every new pane must pass the meaning test. |
| Master prompt | `docs/skills-prompt.md` | Existing orchestration: impeccable context → hallmark pre-flight → audit → shape → build with locked `--tn-*` tokens → break-ui worst-case → polish/harden. The new skill slots in as the **meaning + ease gate** before build. |

## Cross-app pattern distillation (Obsidian / Notion / Bear / Apple Notes / Craft / Logseq)

1. **Files-first, index-second (Obsidian).** Notes are real `.md` files; the index (titles, links, backlinks, tags, properties) is rebuildable and never the source of truth. Takenote mapping: Workspace (not Vault), Document index keyed `workspaceId + relativePath`, `searchableText` = title + aliases + headings + tags + body.
2. **Find fast: Quick Open + Search + Command Palette are three different jobs (Obsidian, VS Code).** Quick Open (`Ctrl+P`) = filename/alias, create-on-no-match. Search = content. Palette (`Ctrl+Shift+P`, `>` mode) = commands. Never merge them into one fuzzy box.
3. **Links are navigation (Obsidian, Notion).** `[[wikilink]]` + backlinks + outgoing links + rename-updates-links. A link that rots silently is a broken promise.
4. **Daily + Today are different (Logseq, Craft).** Daily Note = the dated file at `Daily/YYYY/MM/YYYY-MM-DD.md`, created explicitly never silently. Today = aggregated productivity view (scheduled + overdue + due-today + Daily Note + recents + quick actions). Conflating them confuses "where I write" with "what needs me".
5. **Tasks: checkbox first, metadata progressive (Obsidian, Logseq).** Any `- [ ]` is a valid task; Due (deadline, never rewritten by calendar drags) vs Scheduled (time block, rewritten on drag) stay distinct. Managed tasks get lazily assigned stable IDs.
6. **Collections/Views = saved queries, not folders (Notion, Obsidian Bases).** Definition travels with workspace as YAML; machine state stays local. Presentations: table, list, cards, board, calendar. Never call them Base/Vault.
7. **Editor is sacred (Bear, iA Writer).** One uninterrupted paper surface, max ~760px measure, no card shadow, no permanent formatting ribbon. Formatting lives in selection/menus/palette. Type scale: body 16/1.65, metadata 12–14, never 10px for essentials.
8. **Capture must be instant (Apple Notes, Quick Capture).** Quick-add, quick-open-create, and paste/import (attachments get `attachmentFileName`, dir resolved, link built — never a bare drop that loses the file). Slow capture kills trust.
9. **Calm trust over badges (takenote-specific).** No "Synced/Backed up/Secure" without evidence. Save state is status text (`Saving… → Saved HH:MM:SS / Unsaved ● / Conflict / Error`). Success is silent; failure preserves agency (text stays visible + what happened + is work safe + what next).
10. **Progressive disclosure, essentials never hidden (all).** Rename, advanced ops → context menus / More / palette. Save status, search, create, navigation → always discoverable without hover. No speculative disabled buttons for unshipped features.
11. **Favorites, not bookmarks (Craft, Bear).** Saved shortcut to note, heading, folder, search, collection, task view, calendar view, or URL. One favorites system, not three.
12. **Motion discipline (Emil/Apple).** 100+/day actions (Quick Open, palette toggle, list nav) = no animation ever. Tens/day = imperceptible. Occasional (modals/drawers/toasts) = 200–500ms, GPU only, ease-out enter, interruptible, `prefers-reduced-motion` respected. Respond on pointer-down; 1:1 drag with velocity handoff.

## The skill to build (draft contract)

Location: `.agents/skills/takenote-meaningful-design/SKILL.md` (repo-local, model-invoked so `impeccable`/`hallmark`/`break-ui` flows can reach it).

Leading words: **meaningful** (every element earns its place) and **effortless** (find / where / save / next answered in ≤5s).

Steps (each with completion criterion):
1. **Orient** — read `CONTEXT.md` language + `docs/design/ui-ux/README.md` + target file. Criterion: can name Workspace/Collection/View/Daily/Today/Task-Due-Scheduled/Quick Open/Palette correctly and state which surface (Operate vs Read) this is.
2. **Meaning check** — every rendered element answers find / where / continue, or is removed, demoted to menu/palette, or justified in one line. Criterion: zero elements without an answer.
3. **Ease check** — 5-second test, keyboard path, truthful state, error path, 320px + zoom + dark + RTL. Criterion: all five pass or are listed as findings.
4. **Pattern match** — pick at most one proven pattern from the table above; map to takenote vocabulary; no Vault/Base/Bookmark renames. Criterion: pattern named + why-not-the-others in one line.
5. **Verify** — `break-ui` worst-case dataset (Aleksandra Wiśniewska-Kowalczyk, long emails, Jo, 1284 members, empty/one/1000 rows, CJK/emoji) behind dev-only Demo/Worst toggle; `--tn-*` tokens only; contrast AA. Report before fixing. Criterion: toggle runs, report filed.

Non-goals: no new runtime dep to adopt the skill; no renaming of CONTEXT.md language; no speculative controls; no success-toast spam; no read/edit mode toggle (ADR-0015 single surface).

## Next actions

- [ ] Scaffold `.agents/skills/takenote-meaningful-design/SKILL.md` + `references/{meaning-check,note-patterns,ease-check}.md`
- [ ] Run `impeccable context --target <first surface>` once per session before first UI edit
- [ ] Pilot the skill on one surface (suggested: Today pane or Quick Open) + `break-ui` toggle, then `impeccable polish + harden + clarify`
- [ ] Commit skill scaffold on this branch; keep `App.tsx`/`app.css` WIP separate
