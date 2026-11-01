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
`--tn-*` variables hold the per-theme values and are deprecated for direct use.

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

### Legacy aliases

`legacy-aliases.css` maps old desktop variable names (`--surface-*`,
`--text-primary`, ...) to the public tokens. Deprecated; M6 deletes it.

## Components (`@takenotes/ui/dom`)

Foundation set: `Icon` / `Art` (prototype `ICONS` and empty-state art),
`Button` (default, primary, ghost, danger; sm 26 / md 30 / lg 36; 44 on touch),
`IconButton`, `Input`, `Select`, `Textarea`, `TextField`, `SelectField`,
`Switch`, `Checkbox`, `Chip`, `Badge`, `Pill`, `Kbd`, `Card`, `EmptyState`,
`Skeleton`, `Progress`, `Stepper`, `DataTable`. Styles are in `dom/styles.css`
and use public tokens only.

Deprecated button variants `secondary`, `quiet`, `destructive` still work
(aliases of `default`, `ghost`, `danger`); M4 removes them.

Examples: `npm run storybook` (stories in `src/dom/components.stories.tsx`).
Tests are logic-only (`tests/ui/components.test.ts`, `component-styles.test.ts`):
markup/ARIA, token use, contrast of every colour pair, motion and touch rules.

## Overlays, feedback and shell (M3)

Logic lives in `src/overlays.ts` (placement, menu keys and typeahead, toast
queue, tab overflow, palette keys, save-state words) and is tested without a
browser. Components wire it to events. One example each (live versions in
Storybook, "Overlays and shell"):

```tsx
// Menu: arrows, Home/End, typeahead, Esc. Disabled items give a reason.
<Menu label="Note actions" anchor={button.getBoundingClientRect()} onClose={close} onSelect={run}
  items={[{ id: "rename", label: "Rename", hint: "F2" }, { id: "del", label: "Delete", danger: true, icon: "trash" },
          { id: "mv", label: "Move to…", disabled: "Select one note first" }]} />

// Popover: small panel by a control. Esc / outside press closes, focus returns.
<Popover label="Due date" anchor={rect} onClose={close}>…</Popover>

// Tooltip: names an icon button on hover or focus; the text is its description.
<Tooltip text="More actions"><IconButton label="More actions">…</IconButton></Tooltip>

// Toast: wrap the app once. One at a time, 4 s, paused on hover. Undo must really undo.
const toast = useToast();
toast.show("Note moved to the trash.", { undo: { run: restore } });
toast.show("Could not save: the folder is read-only.", { kind: "error" });

// Banner: warn and danger are announced; info is not. Up to three actions.
<Banner tone="warn" title="This note changed on disk." actions={[<Button size="sm">Show changes</Button>]}>Another app saved it.</Banner>

// Dialog family. Mount to open. Cancel sits left of the decision.
<ConfirmDialog title="Delete notes" destructive confirmLabel="Delete 3 notes" count={{ n: 3, singular: "note" }} onCancel={…} onConfirm={…}>They move to the trash.</ConfirmDialog>
<ErrorDialog title="Could not save the note" cause="The folder is read-only." details={technicalText} action={{ label: "Choose another folder", run }} onClose={…} />
<Dialog title="Rename" unsavedInput={dirty} …>…</Dialog>   // Esc and backdrop keep typed text

// Command palette: combobox + listbox, groups, mode pills, key hints.
<CommandPalette label="Quick open" query={q} onQueryChange={setQ} groups={[{ heading: "Recent", items }]}
  onSelect={(item, { ctrl, shift }) => …} onClose={close} hints={[{ keys: ["Enter"], text: "open" }]} />

// Tabs: dirty dot, close, middle-click, overflow menu; the active tab never hides.
<Tabs tabs={[{ id, label, dirty, conflict, pinned }]} activeId={id} onActivate={…} onClose={…} />

// Shell pieces.
<TreeRow label="Projects" folder expanded depth={0} count={4} />
<Rail items={[{ id: "files", label: "Files", icon: "file", active: true, onSelect }]} footer={[…]} />
<TitleBar start={…} center={…} end={…} />   // keep to three small icon buttons
<StatusBar start={…} end={<SaveStatePill state="saved" />} />
```

Stacking uses `--z-base`, `--z-sticky`, `--z-overlay`, `--z-menu`, `--z-palette`,
`--z-dialog`, `--z-toast`, `--z-tooltip`; never raw numbers. Interface text
stays at 12px or larger (repo rule, enforced in `tests/ui/contrast.test.ts`),
so the prototype's 11px meta text is 12px here.

Not ported: the prototype's block menu and selection toolbar belong to the
CodeMirror editor and stay with it (M4, editor slice).
