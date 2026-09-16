# Keyboard test matrix (§150–§153)

Automated (CI, all three maps): `npm run keymap:check` — PASS on every
platform for collisions, reserved-shortcut avoidance, and native-role
quit/fullscreen/zoom. Manual per-device results below.

| Command | Windows | macOS (MacBook) | macOS (external) | Linux Wayland | Linux X11 |
|---|---|---|---|---|---|
| Save | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| New note | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Quick open | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Command palette | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Find in note | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Workspace search | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Close tab / window | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Settings | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Undo / redo (roles) | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Cut / copy / paste | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Select all | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Zoom / fullscreen (roles) | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Tree rename (F2 / menu) | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Tree trash (Del / ⌘⌫) | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |

## Layout coverage (§151–§154)

| Layout / input | Status |
|---|---|
| US QWERTY | NOT TESTED on hardware (logic: `e.key`-based, no `code` assumptions) |
| AZERTY or QWERTZ | NOT TESTED |
| IME (CJK / Indic composition) | NOT TESTED on device; guard (`isComposing`/`Process`) STATIC PASS |
| Dead keys (é ñ ü) | NOT TESTED on device; no command binds bare printable keys |
| Compose key (Linux) | NOT TESTED; no bindings capture composition sequences |
| Function keys (laptop Fn) | NOT TESTED; no critical command is F-key-only (§152–§153) |
