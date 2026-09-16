# States — takenotes

Sentence case. Short, direct, human. Every error: what happened, is work safe,
what to do.

- **First run:** "Desktop Notes / Open your notes / [ Open Windows folder ]
  [ Open WSL folder ] / Your notes stay where they are…" + Recent workspaces.
- **Empty workspace:** "This folder has no notes yet." + [ New note ].
- **Empty editor:** "No note open" + `Ctrl+P Quick open` · `Ctrl+N New note`.
- **Loading:** workspace open → sidebar rows pulse "Opening…"; WSL connect →
  "Connecting to Ubuntu…" (first run: "Preparing Desktop Notes for Ubuntu…",
  details behind Show details). Note open is instant; search streams partials.
- **Save:** status text only — Saving… → Saved HH:MM:SS / Unsaved ● / Conflict /
  Error. No save toasts.
- **Conflict:** warning bar, not modal. Reload compares hash; Keep overwrites
  expected revision with disk hash then saves.
- **Missing/large/encoding:** editor region shows calm panel with path + reason
  + [ Close tab ] / [ Reveal ]. `TOO_LARGE` (>10 MiB), `UNSUPPORTED_ENCODING`
  (non-UTF-8) come from main errors verbatim, wrapped in human copy.
- **WSL failure:** banner "Ubuntu disconnected — your unsaved changes are safe
  locally. [ Reconnect ]" + Show details (distro, helper/protocol version,
  error code, log path).
- **Toasts (only):** connection lost, save failed, moved-to-trash (+Undo
  unavailable for OS trash — copy says "recoverable from Recycle Bin"),
  permission denied.
