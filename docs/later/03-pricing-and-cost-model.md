> **DEFERRED — build only when users ask for it.** Not part of the current plan. See `docs/later/README.md` for triggers. Everything the app does today stays local and free.

# Deferred: Pricing, plans & cost model

## 0. Product model in one page

| Tier | Price | What you get |
|---|---|---|
| **Free / self-host** | $0, MIT | Everything local: notes, tasks, WSL workspaces, self-hosted server, **local stdio MCP** (already shipped, ADR-0012) |
| **TakeNote Pro** | **$10 one-time** (Dodo Payments) | Google login, Google Calendar two-way sync, **hosted/remote MCP endpoint**, one-click MCP setup for agents, priority updates |

**The honest constraint:** TakeNote is MIT open source. Anyone can fork and delete a license check. You cannot make client-side gating secure, and trying to wastes effort. The defensible strategy is to **gate what lives on infrastructure you operate**, not what runs on the user's machine:

1. **Google OAuth client** (client secret, verified-app status, token refresh) → lives on *your* Account service. Forks need their own Google Cloud project + verification (a real cost for them, trivial for $10 users).
2. **Hosted MCP gateway + calendar sync worker** → your servers; entitlement is checked server-side.
3. **Convenience**: signed builds, auto-update, onboarding, support.

Local code paths can still check a license (to show/hide UI, honest-user friction), but treat that as a UX gate, not DRM. Say this in the README: "Self-hosters can wire their own Google client and run everything free; Pro pays for the managed version." This is the model Obsidian/Plausible/Ghost-style projects use, and it keeps goodwill.

> Decision needed from you: is local stdio MCP (already shipped) staying free? This doc assumes **yes** (free local MCP; paid = remote/hosted MCP + Google integrations). Locking an already-shipped local feature behind a paywall in an MIT repo is unenforceable and will annoy contributors.

---


## 6. Phased roadmap
| Phase | Deliverable | Risk |
|---|---|---|
| P0 | ADRs 0016 (client/server WSL), 0017 (accounts+licensing), 0018 (remote MCP) | — |
| P1 | Server hosts `/mcp` + scoped agent tokens + "Connect an agent" UI (free, local) | low |
| P2 | Desktop `RemoteWorkspace` + pairing + WSL server installer behind flag | med (migration) |
| P3 | Account service: Google login (web+desktop), Dodo checkout + webhook + claim flow, leases | med |
| P4 | Google Calendar sync worker + Google verification | high (external review) |
| P5 | Hosted MCP (OAuth 2.1) gated by `mcp_remote`; retire WSL helper | med |

## 7. Monetization & cost model (supersedes the Pro split in §0)

### 7.1 Key insight: split features by *who pays the bill*
Ask of every feature: "does it consume my infrastructure per use?"

| Feature | Runs where | Marginal cost to you | Therefore |
|---|---|---|---|
| Notes, tasks, WSL, local stdio MCP | User's machine | $0 | Free forever |
| **Google Calendar sync (local)** | User's machine, tokens in OS keychain | $0 | **Pro one-time ($10)** — it's convenience + your verified Google client, not a server |
| Account / license activation / lease refresh | Cloudflare Worker + D1 | ~$0 (tiny, bursty) | Included in $10 |
| **Public share links** | Cloudflare Worker + R2/KV | Storage + requests, grows forever | **Quota-capped in $10; unlimited = subscription** |
| Hosted remote MCP, cross-device sync, calendar *push* | Cloudflare Workers/DO/D1 | Real, scales with usage | **Cloud add-on (subscription)** |

### 7.2 Google Calendar locally (answer to "is there a local way?")
Yes. Use the **installed-app OAuth flow** (loopback + PKCE, RFC 8252): the desktop app talks to Google directly, the refresh token lives in the OS keychain (`safeStorage`), nothing touches your server. Consequences:
- Your server never sees calendar data → no DB, no GDPR surface, no cost, more private (good marketing).
- Trade-offs: sync only while the app is open (poll with `syncToken`, ~5 min); no Google push notifications (those need a public HTTPS endpoint); each device syncs on its own.
- Google still requires **app verification** for the shared client ID (sensitive scope). That's effort, not recurring cost. Until verified: 100-user cap and "unverified app" warning.
- **Self-hoster option:** "Bring your own Google client ID" in Settings (free users). This is how open-source stays honest: Pro buys the *verified, zero-setup* client, not the capability.
- So the earlier §2 design (tokens encrypted on the Account service) becomes the **optional** Cloud add-on path, not the default.

### 7.3 Plans

| | **Free** | **Pro — $10 one-time** | **Cloud — ~$3/mo or ~$24/yr** (optional) |
|---|---|---|---|
| Local notes/tasks/WSL/local MCP | ✅ | ✅ | ✅ |
| Self-host server + BYO Google client + BYO Cloudflare share Worker | ✅ | ✅ | ✅ |
| One-click Google Calendar (verified client) | — | ✅ | ✅ |
| Devices | — | 1 desktop + 1 mobile + 1 tablet | same |
| Public share links | — | **5 live links, 25 MB total, text+small images, branded footer** | unlimited fair-use, images, custom domain, no footer, password/expiry |
| Hosted remote MCP | — | — | ✅ |
| Cross-device sync / calendar push | — | — | ✅ |

Why this works: the $10 users cost you ~pennies/year (5 links × a few KB), so a one-time price is sustainable. Anyone wanting open-ended server use pays recurring, matching your recurring cost. Cloud is optional — if you never want to run it, ship Free + Pro only and skip it.

**Free self-serve share alternative:** publish a one-click "Deploy to Cloudflare" Worker template so users can host their *own* share endpoint on their own free Cloudflare account. Zero cost to you, strong open-source story. Pro then means "we host it for you".

### 7.4 Cloudflare cost reality (verify current pricing before committing)
Workers free tier ≈100k requests/day; paid plan ≈$5/mo base. R2 ≈10 GB free and **no egress fees** (the thing that normally kills share-link products). D1/KV have free tiers. At a few thousand Pro users the whole stack is likely **$5–$25/month**. The danger isn't the baseline; it's an unbounded lifetime promise, so:
- Enforce **per-account quotas in code** (links, bytes, requests); reject beyond quota.
- Cloudflare Turnstile + rate limiting on public share pages and activation endpoints; cache share pages at the edge (`Cache-Control`, so views mostly don't hit the Worker).
- Set billing alerts; no hard spend cap exists on the paid Workers plan, so alert at e.g. $15/$30.
- Expire share links for revoked/refunded licenses, and optionally for long-inactive accounts (documented in ToS).

Dodo takes a per-transaction fee (check current rate; roughly 4% + 40¢ at last known, but verify) as merchant of record, so net on $10 is about $9. They also handle global VAT/tax, which is worth it.

### 7.5 Wording the promise (avoid the "lifetime" trap)
"**Pro is a one-time purchase for TakeNote 1.x.** Server-hosted features have fair-use limits. Major versions (2.x) may be a paid upgrade." Keep the app working forever offline: a lapsed or revoked lease only disables Pro features, never access to notes.

### 7.6 Device slots (one per class)
- Slot classes: `desktop`, `mobile`, `tablet`. Each activation sends `device_class`; the Account service enforces one active activation per class per license, with "replace this device" (deactivates the old one).
- Set the Dodo entitlement activation limit to **3** (Dodo only counts instances; the class rule is ours, enforced before we call Dodo's `/licenses/activate`).
- Slots belong to the **account**, not the key: Google login on the same account is how all three devices share one license.
- Limit swaps (e.g. 2 per 30 days) to stop slot-flipping as a sharing scheme.

### 7.7 Refunds
30 days, no questions. `refund` webhook → license `refunded` → next lease refresh fails → Pro features off, share links unpublished, notes untouched. Chargebacks the same.

### 7.8 Public sharing design (Pro)
- Publish = client renders sanitized HTML (or ships Markdown) → Worker stores in R2 under an unguessable ID (`/s/<22-char base62>`), metadata in D1 (owner, bytes, created, expiry).
- Sanitize on render (DOMPurify-equivalent), strict CSP, `noindex` by default, no scripts, images re-hosted with size caps, `X-Content-Type-Options`.
- Unpublish = delete R2 object + D1 row; cache purge.
- Abuse: report link, takedown tool, ToS; Turnstile on view if flagged.

## 8. Resolved decisions
| Question | Decision |
|---|---|
| Local MCP | Free |
| Google Calendar | Local-first (installed-app OAuth); verified client ID is Pro; BYO client free |
| Devices | 1 desktop + 1 mobile + 1 tablet per account (Dodo limit 3, class rule in Account service) |
| Refund | 30 days |
| "Sharing links" | Public note links, Pro, quota-capped; unlimited = Cloud subscription |
| Hosting | Cloudflare only: Workers + D1 + R2 (+ Turnstile); no VPS |

## 9. Still open
1. Ship the Cloud subscription now, or launch Free + Pro and add Cloud only if demand appears? (Recommended: launch without it.)
2. Starting quota numbers for shares (5 links / 25 MB is a guess; tune from real usage).
3. Add GitHub Sponsors / "support the project" link? (Cheap, fits "I don't need to earn from it".)
