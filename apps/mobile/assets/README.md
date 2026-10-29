# Mobile assets (M3)

`app.json` references these files (all under `apps/mobile/assets/`).
`icon.png` is generated from the same brand source as desktop — run
`npm run icons:export` from the repo root after any brand change.

| File | Spec | Notes |
|------|------|-------|
| `icon.png` | 1024×1024, no transparency | ✅ generated (`icons:export`) — do not hand-edit |
| `adaptive-icon.png` | 1024×1024 foreground, centered safe zone | Android adaptive foreground; bg `#1a1a1a` (in `app.json`) |
| `splash.png` | 1284×2778 (`contain`) | Splash screen; keep the mark centered |

## Generating the rest (after the Expo install)

```bash
# from apps/mobile — adaptive icon + splash still need their exports:
npx expo install expo
npx expo-splash-screen --configure
```

No binary assets are committed until the mark is final — use placeholder PNGs
for the preview build and replace them before any store submission.
