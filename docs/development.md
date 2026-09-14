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
