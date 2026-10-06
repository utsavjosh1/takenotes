# Desktop notebook specification

Part of the [UI/UX guide](README.md). Primary implementation surface: [`apps/desktop/src/renderer/`](../../../apps/desktop/src/renderer/). Keep Electron, preload, host capability checks, and existing note services intact while changing presentation.

## 1. Layout and dimensions

Baseline: **1280×800** logical pixels. Also design for **800×520**, 1024×768, 1440×900, and 1920×1080. Dimensions below are defaults; zoom and larger text must remain usable.

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ mark · Workspace                 Quick open…             native controls│ 40
├──────┬───────────────────────┬───────────────────────────────────────────┤
│Files │ Workspace / location  │ note.md ● [×]   second.md [×]       [More]│ 36
│Search│ [New note]     [More] ├───────────────────────────────────────────┤
│      │                       │ optional conflict / recovery notice      │ auto
│      │ folder                ├───────────────────────────────────────────┤
│      │   selected-note.md    │                                           │
│      │   another-note.md     │       Markdown editor                     │
│      │                       │       max width 760                       │
│      │                       │                                           │
│      │                       │                                           │
│⚙     │                       │                                           │
├──────┴───────────────────────┴───────────────────────────────────────────┤
│ Workspace · WSL · Ubuntu · alex   Unsaved changes      words · Ln / Col  │ 28
└──────────────────────────────────────────────────────────────────────────┘
   48       256 default                  remaining space
```

| Region | Target | Shrink/overflow rule |
|---|---|---|
| Title bar | 40px default | Preserve native controls and drag area; interactive regions are no-drag |
| Activity rail | 48px | Files/Search above, Settings below; no placeholder destinations |
| Sidebar | 256px default, 200–360px resizable | Persist preference, clamp to available space, collapsible |
| Sidebar heading | Auto height, at least 48px | Workspace/location details wrap or disclose via a details action |
| File rows | 32px min | Grow for text scaling; no 28px touch targets |
| Tab strip | 36px default | Horizontal overflow; accessible tab list / overflow menu |
| Editor | Flexible; readable width 760px | Minimum comfortable pane 320px; 32px top, 24–40px side gutters |
| Status bar | 28px min | Hide optional counters first; important status has a visible alternative |

Native titlebar control sizing is controlled by the OS; do not force 48px touch sizing onto caption buttons. Application controls elsewhere must meet the chosen input-mode target size.

### Responsive priorities

1. Keep the active editor, dirty/conflict state, and navigation access visible.
2. Reduce optional status details: Ln/Col, then word count, then index count. Never hide a save failure without an equivalent persistent notice.
3. Collapse the sidebar when it would force the active editor below 320px; preserve the user's preferred width for expansion.
4. For multiple panes, offer an explicit **Focus active pane** action when space is insufficient. Responsive hiding must preserve pane/document state and provide a visible way to switch back; never close dirty documents to fit a window.
5. At very narrow effective widths caused by zoom, sidebar becomes a temporary panel. Do not require decreasing font size to access settings or conflict actions.

## 2. Screen D1 — first launch / no workspace

**Goal:** open a real location without implying import or cloud signup.

- Render the shell with a centered content group, max width 480px. Use a small brand mark, “Your files. A quieter place to write.” as optional supporting copy, and the functional heading **Open a workspace**.
- Primary: **Open folder**. Secondary: **Open WSL folder** only when the platform advertises WSL support.
- Below: recent workspaces, each with name, local/WSL host, and location detail. Show the list only when real entries exist.
- Explain: “Your notes stay in the folder you choose.” Do not automatically populate the user's folder with sample notes.
- Keyboard focus starts on Open folder, not a decorative illustration. After folder selection, retain focus in the opening state and then move to Files or the existing restored active note.
- Permission/missing-location failure stays in this screen with Retry/Choose another folder; no blank full-window error replacement.

**Acceptance:** canceling the native picker changes nothing; a failed open adds no false recent workspace; choosing a workspace never starts editing an empty fallback file.

## 3. Screen D2 — WSL workspace setup

Use the existing `components/wsl-dialog.tsx` and host discovery/services rather than inventing UI-owned shell commands.

### Progressive form

1. **Distribution:** list actual discovered names and Running/Stopped state. No arbitrary green “Ready” badge. Refresh is explicit.
2. **Linux user:** list actual available users for that distribution; show which user will run file operations. Do not silently use root or a different user.
3. **Folder:** show the target Linux path. Provide examples in help text, not as assumed selected data.
4. Summary: **Ubuntu · alex · /home/alex/notes**. Primary action: **Open workspace**.

On changing distribution, clear stale user/path discovery results and pending operations. Connect state must be keyed to the submitted identity, not whichever option is currently highlighted.

### Setup states

- Discovering: “Looking for WSL distributions…” in the form region.
- None: “No WSL distributions found.” Keep Open folder available; offer installation guidance as an external help link if the project has one.
- Runtime setup: “Preparing takenotes for Ubuntu…” with expandable details; show progress percentage only if measured.
- Rejected permissions/wrong identity: inline actionable error, keep selected identity visible.
- Success: close the dialog only after workspace opening succeeds. Show host/user identity in the workspace details and compact status strip.

Do not expose token/endpoint bootstrap secrets, command lines with credentials, or promise that closing a dialog canceled an already-running setup job unless the service supports cancellation.

## 4. Screen D3 — workspace, files, and editor

### Title bar and rail

- Keep the mark small (20–24px). Workspace name receives more space than branding.
- Quick-open launcher label is **Quick open…**, with a shortcut label from the existing registry. Do not label filename-only quick open as full content search.
- Reserve native window control space from actual platform/window overlay behavior, not a universal fixed right offset. macOS traffic-light placement differs from Windows.
- Rail Files/Search actions expose names, tooltips, current state, and focus styling. Settings remains bottom-aligned. No extra Home/dashboard destination.

### Files sidebar

- Workspace header shows name; location/host details are one click away, with a compact WSL badge when applicable.
- New note is an explicit accessible action. New folder and workspace actions can live under More.
- Folders reflect the filesystem, with lazy expansion and clear loading/error states scoped to each folder.
- Creating or renaming uses an inline field where existing behavior supports it: select the basename, keep the extension handling explicit, Enter submits, Escape cancels, validation leaves the input open.
- New-note destination is the selected folder or a visibly stated default root. Never silently use a folder in another workspace.
- Context menu includes supported rename/trash/reveal operations only. Right-click is not the sole route; More and keyboard commands offer the same actions.

### Editor surface

- Use `surface-editor`; no rounded exterior card, border, persistent shadow, or giant decorative title above CodeMirror.
- Retain existing Markdown editing and preferences. Do not duplicate the document's first heading as a separate editable filename/title field in this slice.
- Gutter and syntax colors must use the semantic theme. Selection, caret, matching brackets, and search matches remain visible in both themes.
- Default prose width 760px, with existing full-width preference for code/tables. Horizontal scroll is confined to intentional non-wrapping code/editor regions.
- Active pane is identifiable by its tab/toolbar indicator; inactive panes remain readable and retain independent cursor/scroll state.
- A formatting toolbar is not always visible. Existing editor commands, menus, and future selection-level tools should preserve typing space.

### Tabs and split panes

- Keep tab close controls reachable without hover for keyboard/touch. Dirty dot remains visible until that revision is saved or explicitly discarded.
- Closing a dirty note must use a verified persistence/decision path. Do not quietly close while a save is pending or recovery failed.
- Split uses existing pane operations and document registry. Theme/layout changes must not fork content state per visual component.
- A pane-local conflict never appears on another note because it happens to be active now.
- Sidebar and split separators are keyboard-operable: focusable separator with orientation, current/min/max value, arrow-key adjustment; touch/drag hit area at least 8px without stealing editor text selection.

## 5. Screen D4 — quick open, command palette, and search

### Quick open / commands

- Centered overlay width 560px, max viewport minus 32px; positioned near upper third, not aligned to the bottom of a large monitor.
- 48px input row, clear title/accessible label, query, loading/empty state, up to the available-height result list with scrolling.
- Quick open presents filename + path. Commands present action + platform shortcut. Group headings appear only when they clarify actual groups.
- Opening focuses the input; Escape closes and restores the editor cursor/focus. Select on Enter only outside an active IME composition.

### Workspace search panel

- Replace Files within the existing sidebar; preserve file selection/expansion when returning.
- Query input and supported filter syntax help at the top; result summary below.
- Each result contains name/path and a bounded snippet, with visible query highlighting that survives both themes.
- Opening a result reveals the relevant note/position when supported. Otherwise open the note without pretending to have navigated to an exact match.
- Partial indexing produces a text notice, not just a small warning color on the result count.

## 6. Screen D5 — settings and supporting dialogs

Settings keeps existing sections: **General, Appearance, Editor, Files, Shortcuts, About**. Do not add account/sync settings without a product capability.

- Desktop settings: max width 720px, 176px section navigation, flexible content, 24px content padding. In constrained width, use section selection above content rather than two cramped columns.
- Rows: label and helper text on the left; control on the right. At text scaling/narrow width, stack controls below descriptions.
- Appearance: System/Light/Dark. Apply without editor remount or loss of undo/selection.
- Editor: retain current font size, line width, wrap, and line number settings. Changing a preference must preserve content and navigation state.
- Shortcuts: render labels from the platform keymap; no hardcoded Ctrl labels on macOS.
- About: real version, release status, and capability-gated update action. Pre-release/unsigned disclosures are not replaced with generic “Up to date.”
- History/recovery dialogs use the shared recovery contracts; update dialogs show actual download/verification/install states, not cosmetic progress timers.

## 7. Focus mode

Focus mode removes rail, sidebar, tab strip, and optional counters. Keep an accessible **Exit focus mode** action visible on focus/interaction and available through the registered shortcut/menu.

A conflict, failed save, or disconnected-host warning is not hidden by focus mode. Preserve current note, cursor, selection, scroll, and undo when entering/exiting. Do not switch to a new editor instance to achieve a cleaner layout.

## 8. Desktop completion criteria

- User can open, create, edit, save, search, rename, and navigate with the keyboard alone.
- Native caption controls, dragging, maximize/snap, menus, and shortcuts still behave correctly.
- At 800×520 and 200% scaling, the current note and conflict decision actions remain reachable.
- Theme and sidebar changes preserve editing state; split-pane changes preserve independent focus and shared document truth.
- Local and WSL states are visually distinguishable using actual identity data.
- No inferred “Saved,” no unsupported trash/undo, and no safety information removed merely for visual quietness.
