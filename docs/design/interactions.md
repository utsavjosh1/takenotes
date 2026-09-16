# Interactions — takenotes

- **Hover:** background shift only, ≤150ms, no long animations.
- **Tree:** single click opens (markdown/text). Chevron toggles folder. Hover
  reveals a `···` button; all else via right-click menu. `F2` inline rename
  (Enter save, Esc cancel, inline error). `Delete` moves to trash (no confirm;
  toast notes OS Trash recovery). `→` expand / `←` collapse-or-parent.
- **Tabs:** click activate, middle-click close, drag reorder (native DnD),
  overflow scrolls horizontally. Dirty = `●` + "Unsaved changes" tooltip.
- **Quick open (`Ctrl+P`):** 560–640px modal at ~30% viewport height. Empty
  query shows Recent. Fuzzy filename match, `↑↓ Enter Esc`, mouse optional.
- **Command palette (`Ctrl+Shift+P`):** same shell as Quick open. Empty query
  shows recent commands. Shortcuts right-aligned, muted.
- **Modals/esc hierarchy:** context menu → palette → dialog → inline rename →
  search focus. Esc never destroys draft text.
- **Toasts:** bottom-right, compact, only for failures / trash / disconnect.
  Ordinary success is silent. Errors persist; notices time out (~5s) with Undo
  where applicable.
- **Conflict:** calm warning bar above editor —
  "changed outside Desktop Notes. [ Reload from disk ] [ Keep my version ]".
  Never a full-screen alarm; draft stays visible.
- **WSL disconnect:** editor content stays; quiet banner with Reconnect.
  Normal connection shows only "Ubuntu · WSL" text — no green badge.
- **Reduce motion:** all transitions collapse to none under
  `prefers-reduced-motion`.
