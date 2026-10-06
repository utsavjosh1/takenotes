# Mobile notebook specification

Part of the [UI/UX guide](README.md). **All screens here are proposed.** [`apps/mobile/`](../../../apps/mobile/) is currently a placeholder, not a working native notebook.

## 1. What is shared, and what is native

Share semantic tokens, note policy, validation, result/error contracts, terminology, and persistence rules. Use native navigation, text inputs, accessibility, back behavior, safe areas, and platform file access. Do not embed the website concept as the mobile product or attempt to run desktop CodeMirror directly as a React Native component.

A mobile editor may eventually use a native text surface or a carefully isolated WebView editor. That choice is a separate engineering gate with IME, selection, accessibility, performance, and durability tests. This guide requires plain Markdown fidelity, not a specific unselected editor library.

### Release-blocking product decisions

Before enabling real editing, settle and test:

1. **File ownership:** native app-managed Markdown files, OS document-provider access, authenticated remote workspace, or a clearly labeled combination. A web upload is not equivalent to a linked editable folder.
2. **Durable local drafts:** storage API, failure behavior, when the application may honestly say “Draft saved on this device,” and recovery after process termination.
3. **Remote writes:** identity, revision conflicts, authentication expiry, retry, and whether any offline queue exists. The first release must not imply an unimplemented sync engine.
4. **Export and deletion:** user-readable Markdown export and the real recoverability of deletion for each host.
5. **App lifecycle:** backgrounding, process kill, device restart, keyboard interruptions, and low-storage failure behavior.

Until these are proven, use explicitly labeled design fixtures; do not invite users to trust real notes to a transient state-only build.

## 2. Navigation model

### Phone (compact, width below 600 logical units)

Use **Workspace / Search / Settings** as three labeled bottom destinations while browsing. The active workspace header provides workspace switching; there is no separate dashboard.

Opening a note pushes a focused editor screen. Hide bottom navigation while editing to reserve room for the keyboard; retain a visible Back action and a note More menu. A titlebar **Save** action remains visible when changes need saving. Do not duplicate an always-visible New note button and a floating plus button on the same screen.

```text
Workspace screen                      Editor screen
┌───────────────────────────┐         ┌───────────────────────────┐
│ safe area                 │         │ safe area                 │
│ My workspace  [switch] [+] │         │ [Back] note.md [Save] [⋯] │
│ Local / remote host detail│         │ Unsaved changes           │
│                           │         │                           │
│ [folder] Projects      [⋯]│         │ Markdown text             │
│ [file]   a-note.md      [⋯]│         │                           │
│ [file]   another.md     [⋯]│         │                           │
│                           │         │                           │
│                           │         │ optional keyboard tools   │
│ Workspace Search Settings │         │ system keyboard           │
│ bottom safe area          │         │ bottom inset managed by OS│
└───────────────────────────┘         └───────────────────────────┘
```

Bottom navigation is not the same as the website's mobile menu. No miniature activity rail, desktop tab strip, or horizontal row of ten icon-only destinations.

### Medium and tablet

| Available width | Target layout |
|---|---|
| `<600` | Single screen; push/pop navigation |
| `600–839` | Comfortable single-pane by default; optional dismissible workspace drawer |
| `≥840` | Sidebar 280–320 + detail editor if editor retains at least 400 logical units |

Use available window width, not device model, so split-screen and rotation work. At large font sizes, fall back to single-pane when necessary. Do not add multiple simultaneous editors on tablet in the first slice.

### Navigation state

- Back from a note restores prior folder/query, selected result, and scroll position.
- System Android Back, iOS back button/gesture, and an explicit Back action have consistent semantics.
- Dismiss the keyboard with the native mechanism; do not make a toolbar button the only way to leave editing.
- Pending save or draft failure invokes the data-loss guard on every exit path, including gestures. If safe leave cannot be guaranteed, prevent the transition and present the decision.
- Workspace switching applies the same dirty-state guard and clears/re-scopes host-owned UI; paths from one workspace never leak into another.

## 3. Screen M1 — setup / choose a workspace

- Safe-area layout, 24px top content spacing, title **Choose a workspace**, two sentences maximum explaining available storage choices.
- List only implemented options: for example **Open device folder** if provider access exists, or **Connect to a server** if that integration exists. Do not ship all proposed options as disabled cards.
- Explain permissions before invoking the OS picker. Cancel returns to the same screen without errors or fake progress.
- If files are copied into app storage, label **Import a copy** and explain that editing does not update the original provider document.
- Server setup is a full-screen form: endpoint, authentication method supported by the backend, connect action, inline errors. Tokens/passwords are masked and excluded from diagnostics.
- Recent workspaces show real location type and connection status; do not display a lock icon as proof of encryption or sync.

## 4. Screen M2 — workspace files

- Header: workspace name, switch action, New note action. Long names wrap at larger text sizes or reveal in workspace details; actions remain 48px targets.
- Use a simple list, not a grid of note cards. Rows: 52px minimum, 16px label, 13px optional metadata, 20px icon, More action.
- Open folders as list navigation with an accessible breadcrumb/back path. Avoid deep desktop indentation on a narrow phone.
- Tap opens; long press may show actions, but More provides a visible alternative.
- New-note sheet: destination summary, filename input, Create note/Cancel. Focus filename, validate through shared policy, open editor after successful creation.
- Empty folder: “No notes in this folder.” with New note. Permission/load failure has a separate state; never show an empty list as if it loaded successfully.
- Pull-to-refresh is optional when meaningful; an explicit Refresh action remains available. Refresh cannot replace unsaved editor buffers.

## 5. Screen M3 — editor

### Anatomy

- Top bar: Back, truncated filename with full accessible name, Save when dirty, More. Allow two-row layout at large text rather than compressing controls.
- Save/draft status: one stable line under the bar; persistent conflict/failure notice expands above the document.
- Body: default 17 scalable units, line height approximately 1.65, 20px side gutters, warm editor surface.
- No permanent word count, line/column, pane controls, file-tree rail, or oversized decorative serif title.
- More: supported Rename, Find in note, document details, and export actions. Avoid offering an unimplemented reading mode or rich-text format conversion.

### Keyboard and selection

- Use safe-area + keyboard-aware sizing from native APIs. Do not hardcode keyboard height or double-apply the bottom inset.
- The insertion point and selected text remain visible above the keyboard and optional formatting accessory.
- An optional accessory offers a small subset—heading, bold, list, link—with accessible labels and 48px hit areas. It scrolls horizontally if necessary; it never traps focus.
- Inserting Markdown is one undoable transaction, preserves selection, and respects IME composition.
- Handle dictation, emoji, combining characters, CJK composition, hardware keyboard shortcuts, and system text selection.
- Toolbar actions do not blur the editor and dismiss the keyboard unless the action requires another screen.
- A hardware keyboard can save/search/navigate using native conventions without stealing system shortcuts.

### Save and leave policy

Initial target: explicit **Save**, plus durable local draft capture once that storage is implemented. Do not silently enable network autosave in a visual redesign.

- Show “Saved to file” only after the chosen host confirms the write.
- Show “Draft saved on this device · file not updated” only after local persistence succeeds.
- If leaving with dirty content and no confirmed durable draft, present **Save**, **Keep editing**, and an explicitly destructive **Discard changes** path. Save failure returns to editing with content retained.
- If leaving with a durable draft is supported, explain that state and restore it on return; do not label it as a completed remote save.
- Do not depend on a last-second background callback to save data: mobile operating systems can terminate the process without executing it. Persist drafts during editing, with measured debounce and failure reporting.
- Auto-save to files, if later added, still obeys revision guards, communicates destination, and never retries a conflict as a blind overwrite.

## 6. Screen M4 — search

- Full-screen search within the active workspace; visible workspace scope.
- Input with clear action, Cancel/back, optional supported-filter help. Keyboard opens intentionally when entering Search, not each time the screen rerenders.
- Result row: filename, path, bounded content snippet with visible highlighting. Tapping opens the note; Back restores query and position.
- Distinct states: searching, no matches, failed, partial index, disconnected/unavailable. Local cached results must be labeled if not current.
- Do not promise workspace-wide search if the mobile integration only has already-open documents.

## 7. Screen M5 — settings, conflicts, recovery

Settings uses grouped native-feeling rows: Appearance, Editor, Workspace/storage details, About. Include only real options. Font scaling follows OS settings; an app editor-size preference is additive, not a reason to disable accessibility scaling.

A conflict opens a readable notice and an explicit full-screen/sheet decision, not a cramped desktop banner with two 10px buttons. Use the [shared conflict copy and consequences](components-and-states.md#4-conflict-recovery-and-destructive-choices).

Recovery lists filename/path, host, timestamp, and available actions. Preserve a visible distinction between **Restore draft** and **Save to file**. Authentication expiry keeps locally retained text accessible while reconnecting; it must not clear drafts on logout without a clear data-retention decision.

## 8. Device and lifecycle acceptance

Required test widths: 320, 360, 390, 430, 768, and 1024 logical units; test portrait, landscape, and tablet split-screen. Use real iOS and Android devices before claiming support; simulators alone do not prove provider access, keyboard behavior, or durable storage.

- Safe areas work on notched/home-indicator devices; no controls under system bars.
- VoiceOver/TalkBack announce row names, selection, errors, dialog titles, and save transitions correctly.
- At 200% text scaling, labels/actions wrap; no clipped destructive confirmation.
- Type → background → return; type → force terminate → reopen; type → storage full; type → connection drops. Record which revision survives and what status was shown.
- Permission revoked, server login expires, provider document moves, and remote revision changes all preserve recoverable text without false success.
- Back gestures and hardware Back cannot bypass data-loss decisions.
- The first mobile release is blocked until storage, editor, navigation, and these lifecycle checks have real evidence.
