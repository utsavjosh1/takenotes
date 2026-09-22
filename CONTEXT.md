# takenotes

Filesystem-first local Markdown notebook for Windows with WSL awareness. User Markdown files stay ordinary files.

## Language

### Workspaces and connections

**Workspace**:
The named identity the user opens and works inside: a location plus settings and grants.
_Avoid_: Vault

**Connection**:
How the app reaches a Linux environment: distro plus Linux user plus status. One connection can expose many workspaces.

**Distro picker**:
The "Open WSL folder…" dialog: distro plus Linux user plus Linux path plus connect. Reports precise errors, never a generic failure.

### Knowledge and productivity

**Collection**:
A saved structured query over workspace metadata with multiple presentations. Definitions travel with the workspace as YAML; machine state stays local.
_Avoid_: Base

**View**:
One presentation of a Collection: table, list, cards, board, or calendar.

**Daily Note**:
The calendar-dated note at `Daily/YYYY/MM/YYYY-MM-DD.md` with `type: daily, date: YYYY-MM-DD`. Created explicitly, never silently.

**Today**:
The aggregated productivity view combining scheduled items, overdue and due-today tasks, the Daily Note, recent notes, and quick actions. Not the Daily Note itself.

**Event note**:
An ordinary Markdown note with `type: event` and required `start` (optional `end`) that appears on the Calendar. Body holds agenda, notes, and follow-up tasks.

**Favorite**:
A saved shortcut to a note, heading, folder, search, collection, task view, calendar view, or URL.
_Avoid_: Bookmark

**Task**:
A Markdown checkbox item indexed into the productivity layer. Any `- [ ]` is valid; richer metadata is optional and progressive. Managed tasks gain a lazily assigned stable ID.

**Due**:
A task's deadline date. Never rewritten by calendar drags.

**Scheduled**:
A task's calendar time block. Rewritten when the item is dragged on the calendar; distinct from Due.

### Updates and testing

**Update-check**:
Fetch of the latest stable release tag compared against the running version. Silent when offline.

**Update-download / update-install**:
Fetch of the `.exe` plus `SHA256SUMS.txt`, mandatory SHA-256 verification, launch installer, quit app.

**Release channel**:
`stable` (`vX.Y.Z`, offered by the updater) versus `prerelease` (`-beta`/`-rc`, never auto-offered).

**Logic test**:
Pure protocol or filesystem test runnable on any OS with no real Windows or WSL desktop.

**Parked**:
Code kept in the repo but not a priority that never blocks Windows work.

**Launch-failure**:
Installer ran but no window opens after double-click.

**Install-failure**:
Installer itself was blocked or aborted; app files never land on disk.

**Publisher-warning**:
Windows SmartScreen "Unknown publisher" on an unsigned build. Bypass via More info → Run anyway.
_Avoid_: publisher error

**Download-failure**:
Browser or GitHub fetch blocked or hash mismatch.
