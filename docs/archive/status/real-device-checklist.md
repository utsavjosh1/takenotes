# Real-device release checklists — takenotes

Status of EVERY item below: **NOT TESTED**. These procedures convert the
`NOT VERIFIED` gaps into evidence-backed `PASS` — CI compilation, Ubuntu CI,
Windows mock tests, and macOS build success are NOT substitutes (§28). Fill in
the evidence fields on real hardware; copy the filled record into the release
notes for the tag.

## A. Real Windows 11 + WSL2 proof (§4–§7)

Prefer the developer's physical Windows machine or a controlled self-hosted
Windows runner. GitHub-hosted Windows virtualization is NOT the release
authority for real WSL behavior.

### A.1 Environment record (fill in)

```text
Windows version:            (e.g. Windows 11 Pro 23H2 build 22631.xxxx)
WSL version:                (wsl --version → wsl, kernel, WSLg versions)
Distribution:               (e.g. Ubuntu 24.04)
Architecture:               (x64)
Desktop Notes commit:       (full SHA)
Desktop Notes version:      (package.json)
Installer artifact:         (takenotes-<ver>-win-x64.exe + SHA256)
Private Node runtime path:  (bundled resources path)
Private Node version:       (node --version of the bundled runtime)
Helper path:                (bundled helper.cjs path)
Helper version:             (manifest version)
Protocol version:           (handshake version)
Helper PID:                 (observed at connect)
```

### A.2 Real WSL round-trip (§5)

```bash
# In WSL:
mkdir -p ~/desktop-notes-release-audit
echo "REAL-WINDOWS-A" > ~/desktop-notes-release-audit/proof.md
```

1. Open `~/desktop-notes-release-audit/` through Desktop Notes (packaged build, NOT `npm run dev`).
2. Open `proof.md`, edit to `REAL-WINDOWS-B`, save.
3. From WSL shell: `cat ~/desktop-notes-release-audit/proof.md` → expect `REAL-WINDOWS-B`.
4. External edit: `printf 'REAL-WINDOWS-C\n' > ~/desktop-notes-release-audit/proof.md` (or vim) → verify the application detects the external change.
5. Conflict drill: make Desktop Notes dirty → edit externally again → attempt save → verify `CONFLICT` → verify the external file survives → verify the local dirty draft survives.

### A.3 WSL failure proof (§6) — record evidence per row

```text
helper killed (taskkill / kill helper PID) → expected: DISCONNECTED banner + reconnect
WSL terminated externally (wsl --terminate <distro>) → expected: DISCONNECTED, no data loss
Ubuntu initially stopped → expected: connect starts it or reports precisely
helper missing (delete staged helper) → expected: precise error, no silent fallback
helper old (stale staged copy) → expected: version/projection mismatch refused
private Node runtime missing → expected: precise error (no system-node fallback)
private runtime corrupted (flip a byte) → expected: SHA verification failure
helper corrupted (flip a byte) → expected: verification/handshake failure
wrong protocol version (bump helper protocol) → expected: protocolError + kill
permission denied (chmod 000 note file) → expected: precise error surfaced
Unicode path (e.g. `café-日本語.md`) → expected: read/edit/save round-trip
spaces in path (`my notes/proof file.md`) → expected: round-trip, no shell-quoting bug
```

### A.4 Packaged independence (§7)

With the INSTALLED build (repository, dev Node, npm, Vite, source checkout all
out of play; temporarily remove system WSL Node from PATH if practical):

```text
developer Node absent from PATH?   (result)
source checkout absent?            (result)
system WSL node absent?            (result)
helper still uses bundled runtime? (verify via Helper PID + runtime path)
```

## B. macOS (§16–§18)

### B.1 arm64 (real Apple Silicon Mac)

```text
install packaged DMG → open workspace → read → edit → save →
external edit → conflict → quick open → keyboard shortcuts (§D) →
Cmd+Q → close last window → Dock activate → theme → offline (Wi-Fi off) →
uninstall/remove app → notes survive
```

### B.2 x64

CI-build x64 is the minimum. Real Intel Mac validation is required before
declaring x64 Tier 1 — compilation alone is NOT runtime verification.

### B.3 Signing (stable public release only)

Developer ID signing + hardened runtime + notarization + stapling, verified via
a Gatekeeper test (`spctl -a -vvv` + open) on the DOWNLOADED final artifact.
An unsigned local build is never equivalent. Dev/pre-alpha may ship unsigned.

## C. Linux (§19–§21)

Primary target: Ubuntu 24.04 x86_64, modern Wayland desktop. Test the packaged
`AppImage` and/or `DEB` per the release support policy:

```text
launch → workspace → read → save → external edit → conflict → search →
keyboard (§D) → context menu → file dialog → trash → theme → offline → uninstall
```

Record: desktop environment, Wayland/X11 session, Electron version, GPU info
where relevant. Wayland is first-class — do NOT force X11 globally. X11 gets at
least smoke tests; mark `PASS` / `PARTIAL` / `NOT TESTED` truthfully per session.

## D. Cross-platform keyboard + input (§22–§23)

Single command implementations — only bindings differ (collision suite:
`npm run keymap:check`).

Windows/Linux: `Ctrl+N, Ctrl+P, Ctrl+Shift+P, Ctrl+S, Ctrl+F, Ctrl+Shift+F, Ctrl+W, Ctrl+,`
macOS: `⌘N, ⌘P, ⇧⌘P, ⌘S, ⌘F, ⇧⌘F, ⌘W, ⌘,, ⌘Q`

Manually verify each main command on the real device after the collision suite
passes. Input: US QWERTY + one AZERTY/QWERTZ layout where possible + one
IME/composition input (shortcuts must not corrupt normal text input; the app
already guards `isComposing` — verify on device, don't assume).
