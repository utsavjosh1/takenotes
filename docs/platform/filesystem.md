# Filesystem — takenotes

## Workspace kinds (§11)

`windows-local · windows-wsl · macos-local · linux-local`. The renderer
holds `workspaceId + relativePath` (canonical `/` separators on the wire);
main resolves trusted roots. One semantic contract, four adapters (§146–§147):

```text
WindowsLocalAdapter   NTFS/ReFS, path.win32
MacLocalAdapter       APFS, native node:path
LinuxLocalAdapter     ext4/Btrfs/XFS, native node:path
WslAdapter            Linux FS via wsl.exe → helper.cjs, path.posix
```

No 15-layer framework (§148): the split is exactly where semantics differ
(path rules, trash/reveal, WSL transport).

## Path semantics (§21–§25)

- Windows work: `path.win32` explicitly. WSL/macOS/Linux protocol paths:
  `path.posix`. Native current-OS work: ordinary `node:path`.
- WSL paths never pass through Windows path functions.
- Case: Linux `note.md`/`Note.md`/`NOTE.md` are three files; APFS may be
  either sensitivity — identity is `workspaceId + canonical identity`,
  never `relativePath.toLowerCase()` (§22–§23).
- Unicode names preserved byte-exact; no NFC/NFD rewriting (§24).
- Windows reserved names/characters enforced for Windows workspaces only
  (`isWindowsReservedName`, `appliesWindowsReservedRules`) — never leaked
  into macOS/Linux validation (§25).

## Safety core (every adapter, every OS, §106–§111)

Framed the same everywhere: validate → `resolveInsideRoot` (lstat walk
refuses symlinked components, realpath containment) → operate →
structured `AppError`. Symlink-escape fixtures run per platform
(`ln -s /outside` on macOS/Linux; junctions/reparse separately on
Windows, §107). Writes are atomic temp-file + fsync + rename with
SHA-256 `expectedHash` conflict detection — verified per filesystem
family, never extrapolated (§109–§110). Failure matrix per release:
permission-denied, read-only, externally-changed, removed file/parent,
rename races, full disk, temp-write failure — the original file must
survive each (§111).

## Line endings, encoding (§29)

Existing CRLF/LF preserved per file (`newlineStyle` + BOM round-trip);
never normalized by host OS. UTF-8 only; NUL bytes and undecodable
content report `UNSUPPORTED_ENCODING` instead of corrupting.

## Watchers (§26–§28)

`fs.watch` is notification infrastructure with per-OS behavior
(ReadDirectoryChangesW / FSEvents-kqueue / inotify). Watchers are hints:
every event re-reads state and compares revisions (§27). Test matrix per
platform: direct write, atomic replace, rename, delete, create, rapid
saves, folder rename, sleep/wake, reconnect (§28, §112).

## Trash / reveal (§30–§32, §116)

Native workspaces use `shell.trashItem` (Recycle Bin / Trash / DE trash)
with honest “Move to …” wording — no fake in-app Trash with restore
promises (§31). Reveal labels match the OS (“Reveal in File Explorer /
Finder”, “Show in File Manager”). WSL is separate: host Electron cannot
trash/reveal Linux paths, so those ops report precisely (§30).

## Locations (§19–§20, §100–§102, §168, §170–§171)

`app.getPath("userData" | "logs" | "temp" | "home" | "documents")` —
never hardcoded `C:\Users\…`, `~/Library/…`, `~/.config/…`, never `/tmp`
on Windows, never beside the installed app. OneDrive/iCloud/network
volumes are ordinary locations with watcher + revision discipline intact.
