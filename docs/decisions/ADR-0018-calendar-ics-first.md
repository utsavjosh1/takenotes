# ADR-0018 — External calendars: read-only ICS first (amends ADR-0011)

Date: 2026-10-27 · Status: proposed · Amends: ADR-0011

## Decision

External calendar data enters as a **read-only ICS layer** before any OAuth integration. The user pastes an ICS URL (e.g. Google Calendar's "secret address in iCal format") or imports a file; the app fetches it locally on an interval and renders it as a read-only layer on the Calendar. Nothing is written back and no account or server is involved.

- Event-notes and `@scheduled` tasks remain the only writable sources (ADR-0011).
- Two-way Google sync is deferred until requested and, when built, uses installed-app OAuth (loopback + PKCE) with a user-supplied client ID and the refresh token in the OS keychain. Still local, still free.
- ICS URLs are secrets: stored in app-data (OS keychain where available), never inside workspaces or logs.
- Fetch rules: https only, size cap, timeout, no redirects to other schemes, parse failures degrade to an empty layer with a visible notice.

## Consequences

- Most of the value of "Google Calendar" with no OAuth verification and no recurring cost.
- Recurrence expansion (RRULE) needs a small, bounded implementation or a pinned dependency — decided at build time.
