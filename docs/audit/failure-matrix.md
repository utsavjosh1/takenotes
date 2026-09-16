# Failure matrix — takenotes audit

AUDIT REVISION: ca1e54e… (+ audit fixes). Labels: UNIT / INTEGRATION / STATIC / NOT VERIFIED.

| # | Scenario | Expected | Actual | Verdict |
|---|---|---|---|---|
| 1 | No WSL (`wsl.exe` absent) | Controlled error, Windows folders still work | `workspace:listWsl` catches → `INTERNAL_ERROR "WSL is not available."`; no global failure path in code | PASS (STATIC; live absence NOT VERIFIED) |
| 2 | No supported distro | Clear status, workspace picker usable | Empty distro list → dialog "No distributions found." | PASS (STATIC) |
| 3 | Distro stopped / terminated mid-session | EOF → disconnected, draft preserved, reconnect offered | `exit` → pendings rejected, state disconnected; renderer keeps tab content; banner with Reconnect | PASS (STATIC; live `wsl --terminate` NOT VERIFIED) |
| 4 | Helper missing / runtime missing | Actionable failure, no retry loop | Spawn `error` → DISCONNECTED (S-14 fix, tested); `nextBackoffMs` caps at 4 attempts, no auto-loop (caller-driven) | PASS (UNIT + STATIC) |
| 5 | Corrupt runtime / corrupt helper | Refused before execution | Staged checksums verified at build (never executed here); connect-time nonce+execPath enforced (tested) | PARTIAL (INTEGRATION for connect-time; stage-time NOT VERIFIED) |
| 6 | Version / protocol mismatch | Refuse or replace, never silent interop | Protocol gate kills child → `incompatible` state (tested siblings: nonce + execPath refusal) | PASS (STATIC + sibling INTEGRATION) |
| 7 | Helper crash (kill -9) | disconnected, pendings reject, UI alive | `exit` handler; renderer never blocks on helpers | PASS (STATIC + INTEGRATION incidental) |
| 8 | Malformed frame / stdout garbage | Detect, disconnect, preserve drafts | `protocolError` → supervisor kills child (UNIT-tested emission + wiring) | PASS |
| 9 | Request timeout | Reject, remove from pending map | 30s timer, `pending.delete` on fire; `pendingCount()` exposed | PASS (STATIC) |
| 10 | Permission denied on save | PERMISSION_DENIED, draft retained, disk unchanged | EACCES/EPERM/EROFS mapped; write is read-verify-tmp-rename (no partial overwrite) | PASS (STATIC) |
| 11 | Workspace missing (bad id) | Controlled INVALID_REQUEST, no crash | `validateWorkspaceId` + registry miss → error; malformed/prototype-polluted payloads rejected (explicit field extraction everywhere) | PASS (STATIC + UNIT validators) |
| 12 | File missing / externally deleted | Tab flagged, dirty content preserved, no silent recreate | `writeTextFile` reads first: missing → error, never recreates; load errors render calm panel | PASS (STATIC + INTEGRATION) |
| 13 | External rename | No silent old-path recreate | Same mechanism as 12 | PASS (STATIC) |
| 14 | Conflict (rev A edited, disk → B) | CONFLICT, disk stays B, draft available | sha256 `expectedHash` gate (INTEGRATION-tested both sides) | PASS |
| 15 | Disk full mid-write | Original intact, tmp cleaned, draft kept | tmp(`wx`)+rename: original untouched until rename; helper now `rm`s tmp on failure; Windows path same | PASS (STATIC; live ENOSPC NOT VERIFIED) |
| 16 | Huge file (>10 MiB) | Safe refusal, no freeze | `TOO_LARGE` before read, both sides; renderer panel, no allocation | PASS (STATIC) |
| 17 | Non-UTF-8 / binary | UNSUPPORTED_ENCODING, never rewritten | `fatal:true` decode + NUL-byte guard, both sides | PASS (STATIC + INTEGRATION) |
| 18 | Symlink escape (dir + file) | OUTSIDE_ROOT | lstat-walk + realpath + final-component refusal, both sides; posix INTEGRATION-tested | PASS (posix); Windows logic STATIC, NTFS NOT VERIFIED |
| 19 | Junction / reparse escape | Refuse per MVP model | `lstat` catches symlinks; **junctions may present as directories to lstat — documented limitation** | PARTIAL (see final-audit risks) |
| 20 | Internet offline / drops mid-session | Everything local keeps working | Zero network surface (static scans + lint gate); no "connecting to internet" states exist | PASS (STATIC) |
| 21 | Remote Markdown image | No silent request | No image renderer exists; markdown is inert source text | PASS (STATIC) |
| 22 | Malicious Markdown (`<script>`, `onerror`, `javascript:` URIs) | Inert | Source-only editor; no HTML injection APIs; tightened CSP as second layer | PASS (STATIC) |
| 23 | Invalid / malicious IPC (`__proto__`, huge limits, bad ids) | Controlled errors, main never crashes | Explicit field extraction; validators; `senderIsOurs`; no object spread-merge of payloads | PASS (STATIC + UNIT) |
| 24 | Renderer navigation / window-open attempt | Denied / external-only via allowlist | `will-navigate` + `setWindowOpenHandler` (smoke INTEGRATION on Linux) | PASS |
| 25 | Second application launch | Focuses existing window | `requestSingleInstanceLock` + focus/restore | PASS (STATIC; live dual-launch NOT VERIFIED) |
| 26 | Windows sleep/wake | Reconcile, never trust stale watchers | No watcher infra exists yet (nothing stale to trust); reconnect re-reads | NOT VERIFIED live; design-safe by absence |
| 27 | Search cancel / workspace switch mid-search | No cross-workspace bleed | Renderer-side: results keyed per effect run, cancelled flag drops stale runs | PASS (STATIC) |
| 28 | Draft recovery after kill | Offer restore, never overwrite newer disk | **ABSENT by design (Stage 7)** — renderer drafts are memory-only. Quit-with-dirty loses the draft. Disclosed HIGH limitation, not a silent bug | FAIL by omission → documented; fix = Stage 7 |

One FAIL-by-omission (draft persistence) is pre-existing scope, disclosed in prior
docs and re-disclosed here — it blocks a *release* claim of "drafts survive failures",
not the audit itself.
