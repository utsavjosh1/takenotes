# Connection proof — takenotes audit

AUDIT REVISION: ca1e54e8444f0f70e97253d4c171f7b39df0bf02 (working tree dirty, see final-audit.md)
ENVIRONMENT: Linux container, no wsl.exe, no Windows. Labels: STATIC / UNIT / INTEGRATION / NOT VERIFIED.

## Chain, arrow by arrow

| # | Arrow | Evidence | Verdict |
|---|---|---|---|
| 1 | Renderer → Preload | Single `window.takenotes` object, 16 narrow methods, no generic invoke/send/on. `src/preload/index.ts`. Smoke test asserts bridge keys exactly `app,directory,events,file,search,workspace` and `ipcRenderer`/`require`/`process` undefined in renderer. | STATIC + smoke INTEGRATION (Linux Electron) |
| 2 | Preload → IPC | One named `invoke(channel, …args)` per method; channels fixed strings. No dynamic channel names anywhere (`grep ipcRenderer` shows only preload). | STATIC PASS |
| 3 | IPC → Main service | 13 `ipcMain.handle` in `src/main/ipc/register.ts`, each with `senderIsOurs` (window-from-webContents, non-destroyed) + per-field runtime validation (`validateWorkspaceId`, `validateWindowsRelativePath`, explicit typeof checks). | STATIC PASS |
| 4 | Main → Supervisor | `HelperSupervisor.connect(distro, nodePath, helperPath)`; single owned child; `disconnect()` kills; never `wsl --shutdown` (grep: only comments). | STATIC PASS |
| 5 | Supervisor → wsl.exe | `spawn("wsl.exe", ["-d", distro, "--exec", node, helper, "--stdio"], {shell:false})`. Distro travels as argv element — shell-injection safe by construction. FINDINGS: wsl.exe resolved via PATH (no System32 pin); child inherits full env (NODE_OPTIONS etc. not stripped); no handshake nonce. → fixed during audit (see final-audit). | STATIC CONDITIONAL |
| 6 | wsl.exe → private Node | `resourceBase()` → packaged `resources/wsl/linux-x64/{node,helper.cjs}`; absolute paths passed as argv. FINDING: handshake did not verify `process.execPath`. → fixed (execPath equality enforced). | STATIC CONDITIONAL |
| 7 | Node → helper.cjs | Absolute helper path argv + `--stdio`. stdout=frames only (only `process.stdout.write(encodeFrame…)` in helper; logs→stderr; no `console.log` in helper). | STATIC PASS |
| 8 | helper → workspace scope | `workspace.open` requires absolute `/` root + `stat.isDirectory`; every op re-resolves via `resolveInside` (lstat symlink walk + realpath containment). | STATIC + INTEGRATION |
| 9 | scope → Linux file | `fs.readFile`/`writeFile(tmp,wx)+rename`; CONFLICT on sha256 mismatch. Direct-spawn round-trip test covers hello→write→conflict on Ubuntu Node. | INTEGRATION (tests/integration/helper-roundtrip.test.ts, 24 passed) |

## Not verified here (no WSL/Windows)

REAL WSL arrows 5–9 end-to-end (`wsl.exe` → bundled Node → helper → `~/notes` file),
handshake against the REAL staged runtime, `/proc/<pid>/fd` socket proof,
`wsl --terminate` behavior. The INTEGRATION test executes the real helper bundle
under Ubuntu Node with the real framer — it proves protocol + fs logic, not the
Windows→wsl.exe boundary. Recorded as NOT VERIFIED, not as pass.

## Identifiers / nonce (post-fix)

`connectionId` = workspace registry UUID; `sessionId` = `randomUUID()` per
`connect()`; `generation` starts at 1, bumped on registry `close()`.
`hello` carries `{protocolVersion, nonce: randomBytes(16).hex}`; helper echoes
`nonce`, reports `execPath/uid/home`; supervisor kills the child on nonce or
execPath mismatch. Covered by the round-trip test (nonce-echo assertion).
