> **DEFERRED — build only when users ask for it.** Not part of the current plan. See `docs/later/README.md` for triggers. Everything the app does today stays local and free.

# Deferred: Accounts, Google login, hosted MCP, cloud sync & share links

## 2. Accounts & Google login

### What Google login is for
Not to open the app — notes work without any account. It exists to (a) prove who owns a license across desktop/web/mobile, and (b) authorize **Google Calendar**. So: **optional account, required only for Pro features.**

### Components
- **Account service** (new, small, cloud-hosted; Hono + Postgres, or Cloudflare Workers + D1). Owns: users, license links, Google tokens, entitlement signing keys. Never sees note contents.
- **Same account everywhere:** desktop, web app, mobile all talk to the same service, so one Google identity = one license = same entitlements. (This is what "same sharing link" should mean: one account origin, e.g. `accounts.takenote.app`, used by all clients.)

### Login flows
- **Web:** Authorization Code + PKCE, Google OIDC (`openid email profile`), session cookie on accounts domain.
- **Desktop:** system browser + **loopback redirect** (`http://127.0.0.1:<random>/cb`) with PKCE (RFC 8252). Never an embedded webview (Google blocks it, and it's unsafe). Alternatively custom protocol `takenotes://auth` — the app already has a URI handler (`main/uri/handler.ts`).
- **Mobile:** `expo-auth-session` with PKCE.
- Sign-in produces an **app session** (short access token ~15 min + rotating refresh token, stored in OS keychain via Electron `safeStorage`/`keytar`, Expo SecureStore). Not the Google token.

### Google Calendar
- Separate, **incremental consent**: ask for `https://www.googleapis.com/auth/calendar.events` only when user clicks "Connect Calendar" (not at login).
- Server-side only: Google refresh token is stored **encrypted at rest** (AES-GCM with envelope key from KMS/env) on the Account service; clients never hold it. A sync worker does the two-way sync with `syncToken` (incremental) + push channel/webhook or a 5-min poll.
- Mapping: Markdown event/task with date → Google event; store `googleEventId` in front-matter or the sidecar index (not in the user's file if avoidable; ADR-0008 says files stay truth).
- **Compliance note:** `calendar.events` is a *sensitive* scope → Google app verification (privacy policy, homepage, demo video). Budget a few weeks. Until verified: 100-user test cap + "unverified app" screen.

---


## Hosted MCP authentication (remote only)
### 4.4 Auth for MCP
- **Local server:** per-agent **scoped bearer tokens** created in Settings → Agents ("Claude Code — read/write tasks in workspace X"). Hash at rest, shown once, revocable. This maps onto your existing *grants* + append-only activity log.
- **Hosted (Pro):** OAuth 2.1 with PKCE + dynamic client registration + protected-resource metadata, so Claude.ai/Cursor "Add connector" works with a login click. Token audience-bound to the MCP server (don't pass tokens through to other APIs). Entitlement check (`mcp_remote` in lease/server record) happens at token issuance.
- Scopes: `notes:read`, `notes:write`, `tasks:write`, `calendar:write`, `workspace:<id>`. Default read-only; write needs explicit grant.

