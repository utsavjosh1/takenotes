# M4: apps/mobile

Logic-only verification. The screens are still unwired stubs (state setters are `void`); this migration gives them the shared look and states.

- `packages/ui/src/native/styles.ts`: palette, 44 pt controls, tones, radii, text scaling as pure functions, tested in `tests/mobile/native-styles.test.ts` (touch sizes, contrast of every tone in both themes, pressed/disabled states, font scale never shrinks hit areas).
- `apps/mobile/components`: `theme.tsx` (theme + text size from the appearance setting), `ui.tsx` (Screen, Button, TextField, Banner, Chip, Card, Skeleton, EmptyView, Row), `rows.tsx` keeps the existing prop contracts.
- Screens: Notes, Search, Capture, Settings each have loading, empty and error states and plain words ("Import notes…", not "Import Markdown…").
- Left undone: offline and read-only states need real data binding; not checked on a device or simulator.
