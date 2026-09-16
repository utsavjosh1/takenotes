# Design principles — takenotes

> Does this help the user find a note, understand where they are, or continue writing?

The editor is the product. Everything else supports the editor.

1. **Files first.** The sidebar mirrors the filesystem. No database, no cards, no dashboard.
2. **Quiet chrome.** Navigation recedes; content is brightest. ~90% neutrals, ≤10% accent.
3. **Keyboard-first.** Every core flow works without a mouse. Shortcuts are visible.
4. **Calm trust.** Real files, real consequences: surface save failures, conflicts,
   connection loss. Never toast success spam.
5. **Progressive disclosure.** Advanced actions live in context menus, command
   palette, More menus — not permanent chrome.
6. **Instant feedback.** Expand/select/open respond immediately; skeletons only for
   genuinely slow operations (workspace open, WSL connect).
7. **Restraint over novelty.** Standard desktop interactions. Originality through
   quality, speed, and WSL integration — not strange controls.
