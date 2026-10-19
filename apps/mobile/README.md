# takenotes mobile

Expo app. V1 = `mobile-local` sandbox companion (see `docs/specs/mobile-plan.md`).

Mobile consumes shared behavior through `@takenotes/core`,
`@takenotes/contracts`, and `@takenotes/platform`; it must not fork note policy.

## M0 status (landed)

- `mobile-local` kind + `isMobileKind()` + `getMobileCapabilities()` in `@takenotes/platform`.
- `src/adapters/expo-filesystem.ts` (`ExpoFileAdapter implements HostFilesystem`, tmp+rename, no fsync caveat documented) + `expo-binding.ts` (only file that may touch `expo-file-system`).
- `src/adapters/memory.ts` (`MemoryHostFilesystem` for tests/dev).
- `src/workspace/mobile-workspace.ts` (2-method deep module over `CoreNoteService`).
- `src/sync/sync.ts` (`WorkspaceSync` seam + `LocalOnlySync` no-op).
- Gate: `tests/mobile/m0-seam.test.ts` (12 tests, any-OS, no native deps) — green.

## M1 status (landed)

- `src/adapters/listing.ts` (`DirectoryListing` seam — S1 frozen, listing is separate).
- `src/browse/`: `explorer.ts`, `quick-open.ts`, `search.ts`, `favorites.ts`, `outline.ts` — all thin over core, zero policy fork.
- `src/index/mobile-index.ts`: eager indexed build, 2000/1MiB bounds, canvas exclusion, honest root-failure.
- `@takenotes/ui/native`: `ListRow`/`SearchRow`/`Notice`/`EmptyState` prop contracts.
- Gate: `tests/mobile/m1-browse.test.ts` (18 tests) — green with M0 (30 total).

## M2 status (landed)

- Core `+CoreNoteService.create` (shared by every transport; mobile-first tests).
- `src/editor/`: `session.ts` (pure save-pipeline state machine), `tasks.ts` (preview + revision-guarded toggle).
- `src/capture/`: `quick-capture.ts` (Inbox/Daily/Today), `recovery.ts` (throttle/retention/janitor over KV), `recovery-binding.ts` (AsyncStorage, structural).
- Gate: `tests/mobile/m2-edit.test.ts` (19 tests, fake clock) — green (49 total).

## M3 status (landed, device half pending)

- `src/share/`: `import-export.ts` (V1 text-only import/export) + `expo-share-binding.ts` (picker/sheet, structural).
- `src/settings/appearance.ts` (theme + clamped font scale + KV store).
- `app.json` + `eas.json` + `assets/README.md` (no binaries committed).
- `app/(tabs)` nav shells + `components/rows.tsx` (excluded from root tsc until Expo install — documented).
- Gate: `tests/mobile/m3-polish.test.ts` (12 tests) — green (61 total). Device: install cmd + EAS steps in this README.

## Device setup (run where iPhone/Android are available)

```bash
npx expo install expo expo-router expo-file-system expo-secure-store expo-sharing expo-document-picker @react-native-async-storage/async-storage
# then: remove the tsconfig `exclude` for apps/mobile/{app,components}
npx expo start            # dev client
npx eas-cli build --profile preview   # on-device preview
```

## Next: install Expo runtime deps (device smoke only)

```bash
npx expo install expo expo-router expo-file-system expo-secure-store expo-sharing expo-document-picker @react-native-async-storage/async-storage
```

Then add `app.json` + `app/_layout.tsx` + tabs (deferred until deps land so `tsc` stays green).
