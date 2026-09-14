# Development

Requires Node 24 LTS (`>=24 <25`). Use `.nvmrc` / `.node-version`.

```bash
npm ci
npm run dev        # Vite + Electron main/preload watch + launch (Windows)
npm test           # vitest run
npm run typecheck
npm run lint
npm run build      # renderer + electron + helper bundles
npm run package:win  # Windows NSIS installer (run on Windows)
```

## Verifying the real app on Linux (WSLg)

This container has no Windows interop (`wsl.exe` absent, `/mnt/c` has no
Windows dir) but WSLg provides a display (`DISPLAY=:0`). Electron only lacks
four system libs (NSS/NSPR) — fetch them WITHOUT sudo and run the CDP smoke:

```bash
apt download libnss3 libnspr4
mkdir -p .dev-libs && dpkg -x libnspr4_*.deb .dev-libs/ && dpkg -x libnss3_*.deb .dev-libs/
npm run build
LD_LIBRARY_PATH=$PWD/.dev-libs/usr/lib/x86_64-linux-gnu node scripts/smoke-linux.mjs
```

The smoke spawns the built app, attaches via CDP (Node built-in WebSocket),
asserts React mount + narrow bridge + no Node leaks, and writes
`smoke-artifacts/window.png`. `.dev-libs/` and `smoke-artifacts/` are
git-ignored. `ELECTRON_DISABLE_SANDBOX=1` is set ONLY inside the smoke script
for containers without userns — never in production.

What this proves: window launch, React render, preload bridge shape, security
baseline. What it does NOT prove: `wsl.exe` spawn path, NTFS behavior,
Windows installer — those still need a Windows 11 host.

## Notes for WSL-based agents

- The checkout may live at `/mnt/c/Dev/desktop-notes`.
- Do NOT create a Linux `node_modules` and run Windows Electron with it.
- Windows owns `node_modules/`, `dist/`, `dist-electron/`, `release/`, packaging.
- Invoke Windows builds via `powershell.exe` / `cmd.exe` from WSL when needed.
- Helper logic (`wsl-helper/`, protocol, path tests) runs and tests fine on
  Ubuntu Node directly — no WSL environment needed for that.

## Reproducibility

Pinned exact versions in `package.json` + `package-lock.json`.
WSL runtime pinned in `build-config.json` (`wslRuntime.nodeVersion`).
