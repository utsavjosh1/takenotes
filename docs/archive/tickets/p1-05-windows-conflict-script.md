# P1-05 manual Windows script — two-actor CONFLICT demo

Feeds **P1-11 item 5**. Run on a real Windows 11 host (NOT Linux CI — this
environment has no `wsl.exe`, no NTFS, no packaged app). Record results in
`docs/mvp-status.md` under P1-11; do not claim verification from Linux.

Build once: `npm ci && npm run build && npm run package:win`
(or `npm run dev` for a faster loop — same banners, same codes).

## Part A — windows-local

Setup: open any local folder with a note, e.g. `demo.md` containing `A`.

1. Open `demo.md` in takenotes. Status strip: clean. (Revision A recorded.)
2. Edit in takenotes: change the text to `mine`. Tab shows `● Unsaved`.
3. Outside takenotes (Notepad/VS Code), change `demo.md` to `B-external`
   and save.
4. Back in takenotes, press <kbd>Ctrl</kbd>+<kbd>S`.
5. **Expected banner** (exact text), above the editor:
   > `demo.md changed outside Desktop Notes. Your edits are still safe.`
   with buttons **`Reload from disk`** and **`Keep my version`**.
   Status strip shows the conflict state; the tab stays `● Unsaved`
   (dirty is NOT cleared).
6. Open `demo.md` in the external editor: content is still exactly
   `B-external` — the failed save changed nothing on disk.
7. The takenotes editor still shows `mine` — the dirty buffer is intact.
8. Click **Reload from disk**: editor shows `B-external`, banner clears,
   tab clean. (Alternative: **Keep my version** overwrites with `mine`
   using the fresh revision and reports `Saved` with the new baseline —
   the next <kbd>Ctrl</kbd>+<kbd>S</kbd> succeeds without a second
   conflict.)

## Part B — windows-wsl (same semantics, other transport)

Setup: `Ubuntu / <user> / ~/Notes` with `wsl-demo.md` containing `A`.

1. Connect via **Open WSL folder…** → distro → user → `~/Notes`.
2. Repeat steps 1–8 of Part A, making the external edit from inside WSL
   (`printf 'B-external\n' > ~/Notes/wsl-demo.md` in the distro terminal
   as the same Linux user).
3. **Expected**: the identical banner text, buttons, and outcomes as Part A.
   No WSL-specific conflict wording exists by design (parity).
4. Negative checks (same session):
   - `chmod 000 wsl-demo.md` in WSL → save shows the distinct
     **Permission denied** toast, never the conflict banner.
   - Stop the distro (`wsl --terminate Ubuntu`) → save shows
     **Workspace unavailable**, never `CONFLICT`, never `Not found`.

## Pass criteria

- [ ] Banner text matches exactly (Part A step 5).
- [ ] External bytes byte-identical after the failed save (both parts).
- [ ] Editor buffer + dirty state intact after the failed save (both parts).
- [ ] Reload/Keep-my-version both resolve to a clean saved state.
- [ ] Permission and disconnect failures never render as conflict.
