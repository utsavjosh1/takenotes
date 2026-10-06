# Network audit — takenotes

AUDIT REVISION: ca1e54e… (see final-audit.md). Method: static scans (this environment)
+ Linux-Electron smoke. OS-level socket proof + netlog require Windows — NOT VERIFIED.

## Static results (commands run, outputs recorded)

- Renderer: `grep -rE 'fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|RTCPeerConnection|createServer|\.listen\(' src/renderer` → **zero matches**.
- Main + helper: `grep -rE 'node:http|node:https|node:net|node:tls|node:dgram|fetch\(|axios|createServer|\.listen\(' src/main wsl-helper/src` → **zero matches** (only `scripts/fetch-wsl-runtime.mjs`, a release-time tool, uses fetch — not shipped).
- Servers: `grep -rE '\.listen\(|createServer\(|express\(|WebSocketServer' src wsl-helper` → **zero matches**.
- Telemetry/updater: `grep -riE 'autoUpdater|electron-updater|sentry|posthog|amplitude|mixpanel|telemetry|analytics'` → **zero matches** in shipped code.
- Remote assets: no Google Fonts / CDN / unpkg / jsdelivr references; icons are inline SVG; fonts are system stacks.
- CSP (tightened this audit): `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'self'`.
- ESLint now bans `node:http|https|net|tls|dgram` imports in `src/main/**` and `wsl-helper/**` (`npm run audit:security` enforces).

## Dynamic results (Linux smoke, production bundles)

- `node scripts/smoke-linux.mjs`: window mounts, **zero renderer console errors**; bridge intact.
- Vite dev server / HMR exist only under `npm run dev`; production loads static `dist/renderer/index.html` via `loadFile` (no localhost server in `register.ts`/`window.ts`).

## Report format (§183)

```text
Release build tested: NOT VERIFIED (no Windows host; installer never built here)
Git commit: ca1e54e… (+ audit fixes, see final-audit.md)
Electron version: 44.3.0
Renderer remote requests observed: none (static) / dynamic netlog NOT VERIFIED
Main Node network APIs found: none
WSL helper network APIs found: none
Listening ports added: none (static) / OS proof NOT VERIFIED
WSL helper socket descriptors: NOT VERIFIED (/proc proof needs live WSL)
Offline test: PASS (Linux smoke is inherently offline-capable; no remote deps to fail)
Unexpected traffic: none found
Conclusion: PROVEN for static surface; NOT PROVEN for OS-level dynamic proof
```
