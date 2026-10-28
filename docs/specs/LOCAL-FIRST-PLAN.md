# TakeNote — Local-First Plan (free, zero running cost)

Status: proposal · Date: 2026-10-27 · Supersedes the paid/account/license direction (moved to `docs/later/`)
Inputs: `docs/roadmap.md` (Steps 0–9), ADR-0008/0009/0012/0014, `docs/guides/mcp.md`

## 1. Scope

**In:** everything runs on the user's machine or on a server *they* run (WSL, LAN, Docker). MIT, no accounts, no payments, no telemetry, no cloud bill.
**Out (until asked):** licensing, Google login, hosted MCP, sync, public share links, subscriptions → `docs/later/`.

**Positioning** — what no other notes app does: *Markdown files in your Linux home, usable from Windows UI, and your AI agents (in WSL, Claude Code, Cursor, Codex) read and write the same files through MCP to plan your day.* Everything else is table stakes; this is the reason to exist. Sequence the work around it.

## 2. Senior review of the current roadmap

The roadmap (Steps 0–9) is faithful but is effectively an Obsidian clone: Graph, Canvas, Collections, Properties registry, 40+ search operators, embeds, themes. Observations:

1. **Scope vs. one maintainer.** Steps 0–9 are years of work. The ADRs say "no further design expansion" — agree. Ship order must follow *value to the daily loop*, not Obsidian feature parity.
2. **The differentiator is under-prioritized.** WSL + MCP + tasks/calendar/Today is the unique story but sits in Steps 6/8 and "post-MVP WSL". Promote it.
3. **Graph/Canvas are the costliest, least-used features** (Obsidian users mostly use links, search, daily notes, tasks). Push them last, behind demand.
4. **WSL helper-per-user is the riskiest component** (wsl.exe spawning, user discovery, pinned Node, framing protocol). The server already exists and passes parity tests (ADR-0014, `tests/server/gate-c`). Reuse it; retire the helper later.
5. **MCP is stdio + "app must be running"** — wrong shape for agents *inside* WSL and for headless use. Add a localhost HTTP transport on the server (still zero cost, still local).
6. **Google Calendar doesn't need OAuth to start.** A read-only ICS feed gives 80% of the value with no verification, no tokens, no cost.
7. **Mobile:** the Expo scaffold exists, but file sync is a product in itself. Don't build it; document Syncthing/iCloud/Dropbox-folder workflows.
8. **Version honesty:** README says v0.0.8 / package.json 0.1.10. Fix drift; keep one source (`version:check` exists).
9. **Don't pre-build paid seams.** One cheap exception: a single `features.ts` returning all-true, so a later gate has one place to land. Nothing more.

### Simplify (cut or shrink)
| Item | Change |
|---|---|
| Graph + Local Graph | Defer; ship backlinks/outgoing panes first (80% of the value) |
| Canvas | Defer entirely until requested |
| Collections | Table + list only (already planned); no boards/cards/formulas |
| Search | Ship words, phrases, `-`, `tag:`, `path:`, `file:`, `task:`, `[prop]`; defer regex/subqueries/comparators until asked |
| Properties registry | Lossless round-trip only; UI minimal |
| Import | Markdown folder + Obsidian vault only |
| Themes/snippets | Light/dark/system + accent; no marketplace |

## 3. Plan by tier (existing features + new work)

### Tier A — Trustworthy core (existing; finish & harden)
Roadmap Steps 0–2, mostly built. Remaining work is *proof*, not features.
- Filesystem safety: atomic save, `expectedRevision`/CONFLICT, root confinement, trash, link-aware rename, watcher reconcile, recovery snapshots.
- Editor: single-surface WYSIWYG, tabs, autosave, find/replace.
- Organization: Explorer, Quick Open, Command Palette, hotkeys, Favorites, Outline, page preview.
- **Exit gate:** real Windows 11 + macOS + Linux manual pass, existing logic/integration suite green (`npm test`: 103 files / ~1159 tests recorded).

### Tier B — The daily loop (existing; this is the product)
Steps 3–6 trimmed: **index → links/backlinks → search → Daily/Today/Tasks/Calendar/Quick Capture/Templates.**
- Tasks: `- [ ]`, `@due/@scheduled/@priority`, toggle = checkbox only (ADR-0010).
- Calendar: event-notes + `@scheduled` tasks (ADR-0011).
- Today view + Quick Capture to `Inbox.md`.
- **New (small):** `plan_today` aggregation shared by Today view and MCP so UI and agents see the same thing.
- **Exit gate:** a user can capture, find, plan the day, and complete tasks without touching a mouse or a settings page.

### Tier C — Agents via MCP (existing + new) ← the differentiator
Server-hosted MCP over the same services (ADR-0014: one semantic).
1. `takenotes-server` exposes `POST /mcp` (Streamable HTTP, `@modelcontextprotocol/sdk`), bound to `127.0.0.1`.
2. Auth: **per-agent scoped bearer tokens** created in Settings → Agents (hashed at rest, shown once, revocable, scoped to workspace + read/write). Maps onto existing grants + activity log. Check `Origin`; loopback only.
3. Keep `takenotes-mcp` stdio as a bridge (`--server URL --token …`) for stdio-only clients.
4. Tools: existing V1 list (ADR-0012) + `plan_today`, `task_create_many`. No delete, no raw FS, no command exec. CONFLICT returned as actionable `isError` result.
5. **"Connect an agent" screen:** copy-paste config per client (Claude Code, Cursor, Codex) with the token filled in. This single screen is what makes MCP usable by non-experts.
6. Contract tests: golden `tools/list`, each tool exercised over stdio and HTTP on the same fixtures.
- Amend ADR-0012: "app-must-be-running" → "server-must-be-running"; HTTP stays loopback-only.

### Tier D — WSL via client/server (replaces the helper)
Full design in §4. Reversible, behind a flag, helper kept until parity.

### Tier E — Local calendar integrations (zero cost)
1. **ICS import/export** and **read-only ICS subscription** (user pastes Google Calendar's "secret address in iCal format"; fetched locally on an interval; shown as a read-only calendar layer). No OAuth, no Google verification, no server.
2. **Two-way Google sync (only if asked):** installed-app OAuth (loopback + PKCE), **bring-your-own client ID**, refresh token in OS keychain. Still zero cost. A shared verified client ID is a *later* item.
- Amend ADR-0011: external calendars stay read-only ICS first.

### Tier F — Polish & reach
Appearance/a11y baseline (Step 9), Markdown + Obsidian-folder import, URI scheme (`takenotes://`), mobile as "open the same folder via your sync tool".

### Tier G — Demand-gated (no work until asked)
Graph, Canvas, regex/advanced search, Bases-style views, themes marketplace, plugins, Vim mode, everything in `docs/later/`.

## 4. Client/server for WSL (the user-management fix)

Problem: desktop spawns `wsl.exe` → pinned Node → `helper.cjs` per distro *and Linux user*. Multi-user distros and runtime install are fragile.

Target: **one `takenotes-server` per Linux user**, desktop is a thin HTTP client.

```
Windows desktop (Electron) ── HTTP 127.0.0.1:<port> + token ──▶ takenotes-server (WSL, as user)
Windows desktop ── native fs ──▶ local workspaces
AI agent in WSL ── MCP http://127.0.0.1:<port>/mcp ─────────────▶ same server, same files
```

- WSL2 forwards `localhost`, so no networking setup. The server runs as whoever launched it → no `wsl -u`, no sudo, no user discovery.
- **Install:** one command (`curl … | sh` or desktop "Set up WSL" button running a single `wsl.exe -d <distro> -- sh -c …`) installs the server bundle under `~/.local/share/takenotes/` and an optional `systemd --user` unit (falls back to on-demand start).
- **Pairing:** installer prints a `takenotes://pair?url=…&token=…` link; clicking it opens the desktop (existing URI handler) and stores `{name,url,token}` in the OS keychain. No 6-word codes, no discovery.
- Invariants unchanged: server owns files, `expectedRevision`/CONFLICT, no automatic local↔remote sync (ADR-0014).
- **Migration (reversible):**
  1. `RemoteWorkspace` in desktop over the existing `/api/rpc/*` transport.
  2. Pairing + per-user lifecycle.
  3. Flag `wslBackend: "server" | "helper"`, default `helper`; flip after a soak release.
  4. Delete helper only after one full release on `server`. Rollback = flip the flag (files are authoritative, no data migration).
- Failure UX: server not running → "Start server" button; port busy → pick next; version skew → `PROTOCOL_VERSION` check with clear message.

## 5. Security baseline (local doesn't mean unguarded)
- Server binds `127.0.0.1` by default; remote bind requires explicit flag + TLS/Tailscale (ADR-0014).
- Tokens: random ≥256-bit, hashed at rest, revocable, scoped; sessions use `__Host-` cookie + CSRF (already built).
- Agents are semi-trusted: prompt-injection safe by design (no delete, no shell, path confinement, per-workspace grants, activity log visible in-app, bulk-write confirmation).
- Supply chain: pinned deps, `audit:deps`, unsigned builds called out in README until signing exists.

## 6. Order of work
| # | Deliverable | Why this order |
|---|---|---|
| 1 | Tier A exit gate on real OSes | Nothing else matters if saving isn't trustworthy |
| 2 | Tier B loop (index → search → Today/Tasks) | The product |
| 3 | Tier C MCP over HTTP + tokens + Connect-an-agent | The differentiator, mostly reuses existing services |
| 4 | Tier D WSL server backend behind flag | Removes the biggest fragility |
| 5 | Tier E ICS subscription | Cheap, high-value, no auth |
| 6 | Tier F polish, then stop and listen to users | Demand decides the rest |

## 7. Decisions recorded
| Question | Decision |
|---|---|
| Pricing | Free, MIT. Paid ideas parked in `docs/later/`, demand-triggered |
| Local MCP | Free; HTTP on loopback + stdio bridge |
| Google Calendar | ICS read-only first; two-way = BYO OAuth client, local tokens |
| Google login | Not needed locally; deferred |
| Devices/refunds/shares | Deferred with pricing (`docs/later/03`) |
| WSL | Server per Linux user, helper retired after parity |
| Mobile | Folder-sync workflow, no custom sync |

## 8. Next concrete steps
1. Write ADR-0016 (WSL client/server, supersedes helper), ADR-0017 (MCP HTTP transport + agent tokens, amends 0012), ADR-0018 (calendar: ICS first, amends 0011).
2. Update `docs/roadmap.md` ordering to match §6 and mark Graph/Canvas as demand-gated.
3. Implement Tier C steps 1–3 (server `/mcp`, token store, stdio bridge flags) — smallest slice that delivers the differentiator.
