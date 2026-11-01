# M4: apps/desktop

Logic-only verification. Done in slices; each is its own commit on `migration/m4-desktop`.

| Slice | Before | After |
| --- | --- | --- |
| 1 Overlays | Own context menu, toasts (zustand store), tab strip, palette | Shared `Menu`, `ToastProvider`/`useToast`, `Tabs` (with drag reorder), `CommandPalette`. Desktop keeps thin adapters (`ContextMenu`, `TabStrip`) and its row-building logic |
| 2 Shell | Own rail, title bar, status bar, 35 Lucide-style icons | Shared `Rail`, `TitleBar`, `StatusBar`, `Pill`; icons map to the shared set (3 glyphs added). 20 dead CSS rules pruned |
| 3 Tokens | ~40 legacy variable names (`--surface-*`, `--sp-*`, `--radius-*`, `--motion-*`) | Public tokens everywhere; `legacy-aliases.css` deleted; user text size/line height/width are `--fs --lh --measure` |
| 4 Words | Outline, Properties, Backlinks, Frontmatter, Markdown, Wikilinks, Vault in the UI | On this page, Details, Linked from, plain descriptions (guarded by `tests/ui/jargon.test.ts`) |
| 5 Forms | Raw inputs, selects, checkboxes, link buttons | Shared `Input`, `Select`, `Switch`, `Checkbox`, ghost `Button`, `Chip`, `Card`, `Skeleton`, `ErrorDialog` |

Differences chosen on purpose: toasts last 4 s (errors included; hover pauses) where errors used to stay until dismissed; buttons are 30 px, not 36 px; sidebar 248 px, status bar 26 px; menus 8 px radius; the connection error dialog has one action (the header close button replaces Cancel).

Left as is: file tree rows (drag/drop, rename, roving focus) keep their own markup with token styling; canvas inline editors; the note title input; list rows that are `button` elements by design. The CodeMirror editor chrome (block menu, selection toolbar) was not re-skinned.
