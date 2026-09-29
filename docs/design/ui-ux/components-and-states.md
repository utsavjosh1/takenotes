# Components, interaction contracts, and content states

Part of the [UI/UX guide](README.md). Apply the [foundations](foundations.md) on every platform; adapt presentation without changing data semantics.

## 1. Component anatomy

Components render supplied state and emit user intent. They must not infer that a request succeeded, manipulate filesystem paths, or invent a different revision/conflict policy.

### Buttons and icon actions

| Variant | Appearance | Examples |
|---|---|---|
| Primary | `action-fill` / `action-text`, medium weight | Open workspace, create note, confirm a settings form |
| Secondary | Control border, surface fill, primary text | Cancel, retry, open folder |
| Quiet | Transparent, visible text/icon, hover fill | More, close, toggle sidebar |
| Destructive | Danger text and boundary on neutral surface; danger-tinted pressed state | Confirm delete, discard changes |

- Desktop: 36px default height, 12px horizontal padding, 8px icon/label gap. Touch: minimum 48px target and 16px label.
- States: idle, hover, focus-visible, pressed, unavailable, pending. Focus remains distinguishable over hover/selected fills.
- A pending action retains its width and changes its label (“Opening…”); prevent duplicate submissions. It is not successful until the operation returns successfully.
- Loading must not remove the button's accessible name or strand focus. If a focused control becomes disabled, provide an understandable status update and a stable next focus target.
- Essential actions use a verb: “Create note,” not “OK”; “Discard changes,” not “Continue.”
- At most one primary button per dialog/footer. Do not style a destructive action as the default safe choice.

### Fields, checkboxes, and settings controls

An input group contains **label → control → help/error text**. Placeholders are examples, never the only label.

- Inputs: 36px desktop / 48px touch minimum; 12px inline padding; `border-control`; 8px radius.
- Validate on submit; after the first failure, revalidate that field on change or blur. Do not announce errors for every character before the user finishes typing.
- Connect help/error text with `aria-describedby`; invalid fields expose `aria-invalid`.
- Inline error states contain icon/text plus a boundary change, not a red border alone.
- Keep submitted values on failure. Focus the first invalid field after submission; for non-field errors, focus/announce the error summary as appropriate.
- Toggle or checkbox preferences apply immediately only when safely persisted; no extra Save button for appearance toggles. Report persistence failure without changing note content.
- Server connection/authentication forms submit explicitly. Passwords, bearer tokens, and full credentials never appear in toasts or diagnostic copy.

### File/folder row

```text
[expand] [type icon]  filename / folder label        [dirty] [more]
                     optional disambiguating path
```

- 32px desktop minimum, 52px touch default. 12px horizontal padding; 8px gaps; 16px tree indentation per level.
- The selected note uses `surface-selected` plus a 2px leading indicator or equivalent outline. Focus is a separate outer ring.
- Desktop tree semantics follow the tree keyboard pattern: Up/Down move through visible nodes; Right expands/enters; Left collapses/returns to parent; Home/End reach first/last; Enter opens; Space selects where needed.
- Do not mark a simple mobile note list as an ARIA tree. Use a native list with explicit folder navigation.
- Open, rename, and delete are distinct actions. Double-click is never the only way to open a note.
- Secondary path text disambiguates equal filenames. Keep the full filename available programmatically.
- Hover-only More buttons must also appear on keyboard focus; touch displays a persistent More action.
- Selection and request loading must not widen the row or replace its label with a spinner.

### Tabs and segmented controls

Tabs navigate documents or panels; a segmented control toggles a view mode. Do not mix their semantics.

- Desktop document tab: 120–220px wide, 36px high; filename, dirty dot, close action. Active tab meets the editor surface with an accent indicator, not a raised card shadow.
- Keyboard: roving focus and platform-registry document navigation commands; focus/active tab states remain separate. The close action has a specific label, such as “Close meeting.md.”
- A Write/Read segmented control appears only where both modes exist. Use two buttons with pressed state or a correctly implemented radio group; do not use tab semantics without corresponding tab panels.
- Reordering has an accessible command/menu alternative to drag. On phones, use a note switcher instead of compressing desktop tabs.

### Status notices

```text
[warning icon] File changed outside takenotes.
               Your edits are still open. Choose which version to use.
               [Reload from disk] [Keep my version] [More details]
```

- Place an operation-specific notice beside the affected pane or field. Workspace connection notices belong at workspace scope.
- Use 12–16px padding; text and actions wrap. On phones, put actions on separate rows if needed.
- Important unresolved conflicts and save errors are persistent, not dismissible success-style toasts.
- Keep message hierarchy: short cause, precise persistence state, next action. Technical error code/details are expandable and copyable without secrets.
- Use assertive announcements sparingly for failures requiring immediate attention. Routine progress/success uses a polite live region isolated from cursor/word-count output.

### Menus, popovers, dialogs, and sheets

| Surface | Use | Dismissal/focus |
|---|---|---|
| Menu | Short contextual commands | Escape/outside click closes; arrow keys navigate; return to trigger |
| Popover | Small non-destructive details | Escape/outside click closes; explicit trigger state |
| Dialog | Setup, decisions, focused editing of settings | Focus contained; explicit title and close/cancel; return focus |
| Mobile sheet | Short action list or small form | Native back/close; gestures have button equivalents |
| Full screen | Long mobile form, search, editor, complex recovery | Native navigation/back; preserve entered state |

- Dialog width: 440px simple / up to 720px settings; max `calc(100vw - 32px)`; max height `calc(100dvh - 32px)`; inner content scrolls and actions remain reachable.
- On touch, actions meet 48px targets; a bottom sheet respects safe areas and keyboard height.
- Destructive confirmations do not close on backdrop click. Escape/Back means cancel, never confirm.
- A modal makes background content inert. Screen readers must not wander into the obscured editor.
- Maintain one modal decision at a time. Prefer inline errors to stacking an error dialog over a connection dialog.
- No custom modal implementation is complete until focus trapping, focus return, Escape, backdrop behavior, scroll locking, and nested menu layering are verified.

## 2. Source-of-truth state model

These are UI contracts mapped to existing services/stores, not a new persisted schema. Keep document identity scoped to its workspace/host; a filename alone is insufficient.

| State category | Example values | Owner |
|---|---|---|
| Document | clean, dirty, saving, conflict, error, missing | Existing document/workspace controller and revision responses |
| Connection | connected, disconnected, reconnecting, failed | Actual host/runtime lifecycle |
| Recovery | unavailable, pending, durable draft available, restore decision | Recovery service acknowledgements |
| Search/index | idle, searching, ready, partial, failed | Index/search service |
| Presentation | active pane, open dialog, sidebar width, theme | App presentation state |

Do not use `isLoading` as a single global flag that disables the whole app for unrelated operations. A failed search must not block editing an open note.

### Save transitions

```text
clean --edit--> dirty --save intent--> saving
saving --success for current buffer--> saved/clean
saving --success, newer edits exist--> dirty
saving --revision mismatch--> conflict
saving --other failure--> error (buffer retained)
conflict --explicit resolution + successful revision-checked save--> saved/clean
```

- “Saved” means the host acknowledged the file write for the relevant revision, not that a debounce ran or a recovery snapshot exists.
- If the user types while a save is pending, an older successful response must not clear the newer dirty state.
- Replies for a previous workspace/note cannot update the active workspace's UI. Ignore/cancel stale requests using the existing identity/generation mechanisms.
- On initial successful file load, show “No unsaved changes,” or a quiet clean state; do not fabricate a save timestamp.
- Explicit Save remains supported on desktop. This visual work does not silently introduce autosave. Mobile/browser autosave is gated on reliable storage and revision behavior.

## 3. Required state inventory and copy

| Situation | Display and location | Actions / behavior |
|---|---|---|
| No workspace | Centered welcome: “Open a workspace” / “Choose a folder of Markdown files.” | Open folder; capability-gated WSL/connection option; recent workspaces if any |
| Empty workspace | Files panel: “No notes yet” / “Create your first Markdown note in this workspace.” | Create note; do not create welcome files automatically |
| No selected note | Editor: “Choose a note to start writing.” | Open note / new note; platform shortcut hints where applicable |
| Opening workspace | Stable shell: “Opening workspace…” | Keep identity visible; cancel only if implemented; no fake percent |
| Creating note | Form/inline row: “Creating…” | Disable duplicate submit; focus editor only after successful creation |
| Dirty document | Dot + “Unsaved changes” | Explicit Save; preserve dirty indicator across navigation |
| Saving | “Saving…” | Do not erase the buffer or move cursor |
| Save success | “Saved at 14:32” using locale formatting | Quiet persistent status; no toast |
| Save failed | “Couldn’t save this note. Your edits are still open.” | Retry; details; offer a safe copy/export only if supported |
| Revision conflict | “File changed outside takenotes.” | Explicit version choice, see next section |
| Connection lost | “Disconnected from Ubuntu · alex. File saves are unavailable.” | Reconnect; local text remains accessible; draft persistence stated separately |
| Reconnecting | “Reconnecting to Ubuntu · alex…” | Do not mark connected until verified; retry/backoff comes from service |
| Draft durable | “Draft saved on this device. File not updated.” | Show only after durable recovery acknowledgement |
| Draft unavailable | “Changes are only in this session. Keep this window open.” | Copy/export escape path where possible; no false “safe” claim |
| Recovery candidate | “An unsaved draft is available.” | Review/restore/discard flow; restoring is not saving to the original file |
| Missing file | “This file moved or was deleted.” | Keep dirty buffer; retry/reopen location; do not silently recreate it |
| Permission denied | “You don’t have permission to write this file.” | Preserve content; reconnect as appropriate user or use supported copy action |
| File too large | “This file exceeds the editor’s supported size.” | Show actual configured limit when known; no whole-file rendering attempt |
| Unsupported encoding | “This file can’t be edited as UTF-8 Markdown.” | Leave disk unchanged; close / supported external-open action |
| Search running | “Searching…” within results header | Keep query usable; cancel/ignore stale results |
| Search empty | “No notes match ‘query’.” | Clear query; edit filters; do not suggest re-creating existing files |
| Index partial | “Some files were not indexed.” | Explain actual limits/skips; never present results as exhaustive |
| Website sample edited | “Demo edit only · refresh clears changes.” | Reset samples; never show ordinary Saved status |

Text such as “Both versions are safe” is allowed only when both versions are actually retained by the implementation. A visible buffer is not a guarantee of durability after process termination.

## 4. Conflict, recovery, and destructive choices

### External-edit conflict

1. Retain the user's open buffer and show a persistent pane-local warning.
2. Offer existing actions with consequence text:
   - **Reload from disk:** “Replace the open edits with the current file.” Confirm discarding unsaved work or preserve a recoverable copy before replacement.
   - **Keep my version:** “Replace the file with the open edits.” Read/check the latest revision through existing services; a subsequent external change produces another conflict, never a blind overwrite.
3. Confirmation names the note and destination; initial focus goes to the safe/cancel action.
4. Clear the warning only after resolution succeeds. Failure preserves the decision context and open content.
5. A side-by-side diff is optional later work; do not expose a dead “Compare” button in the first design slice.

### Recovery

- List recovery entries with note path, workspace/host, and timestamp. Do not choose a revision by filename alone.
- Review or restore into the open draft first. State “Not saved to file.” Saving then follows the normal revision guard.
- Discarding a recovery entry is an explicit action with a confirmation when it is the only retained copy.
- If the recovery store is unavailable/full, surface that fact. Never remove the original dirty buffer just because the recovery UI opened.

### Trash versus delete

- Label **Move to trash** only if the host provides recoverable trash behavior.
- Where deletion is permanent, label **Delete permanently** and state that there is no built-in undo.
- Confirmation: note/folder name, affected scope/count when known, consequence, Cancel, destructive action.
- Respect existing confirmation settings for supported trash flows. Permanent deletion always requires an explicit decision.
- Offer Undo only when restoration is implemented and verified. A decorative Undo toast is worse than no toast.

## 5. Search and command surfaces

- Quick open: filenames/recent notes; command palette: actions; workspace search: content and filters. Their titles and input hints must make the distinction clear.
- Render existing query syntax (`file:`, `path:`, etc.) only where supported by the current search parser; show useful examples rather than inventing new filters.
- Debounce expensive workspace search around 150–200ms; immediate local selection feedback does not wait for debounce. Composition input is not submitted mid-IME sequence.
- Results have filename, disambiguating relative path, optional text snippet, and an accessible match description. Highlight with text-safe markup, never raw HTML from notes.
- Keyboard opens the selected result; Escape closes the top surface and restores prior focus. Clicking a result and keyboard activation take the same code path.
- Preserve query and result position when returning from a note; changing workspace resets or explicitly re-scopes the query/results.

## 6. Writing and content rules

- Preserve native text selection, context menus where appropriate, clipboard, undo/redo, IME composition, and spellcheck preferences.
- Typography or chrome rerenders must not recreate the editor and lose undo history. Treat any necessary editor remount as a tested behavior change.
- Rendering Markdown never interprets raw user HTML without a reviewed sanitizer/security policy. Unsafe links do not execute in the app context.
- Raw Markdown editing and rendered reading are distinct modes in read-only views; reading never silently modifies the file. Desktop editing follows ADR-0015's single editable CodeMirror surface (no separate Read/Edit mode).
- Formatting actions operate on the current selection and are undoable. Mobile toolbars insert Markdown, not hidden rich-text data.
- A load error is not an empty string document. Do not allow an unsuccessful read to become a successful save of an empty file.

## 7. Tone checklist

Prefer “Couldn’t open this folder. It may have moved.” over “Something went wrong.” Prefer “Reconnect” over “Try again” when the action is specifically reconnecting.

Never blame users, promise absolute safety, expose credentials, rely on red/green alone, or use marketing language in a destructive confirmation. Paths and technical details belong in selectable secondary text, not the first sentence of every message.
