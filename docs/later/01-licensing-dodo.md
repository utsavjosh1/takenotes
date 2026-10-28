> **DEFERRED — build only when users ask for it.** Not part of the current plan. See `docs/later/README.md` for triggers. Everything the app does today stays local and free.

# Deferred: Licensing with Dodo Payments

## 3. Licensing — how it works, end to end

### 3.1 Concepts (the knowledge you asked for)
- **License key** = a random bearer secret the vendor issues after purchase. Possessing it = right to use. It identifies *entitlement*, not a person.
- **Activation** = binding a key to a device/installation ("instance"). Limits piracy by capping how many machines use one key (e.g. 3).
- **Validation** = asking the issuer "is this key/instance still good?" (revoked by refund? expired?).
- **Entitlement token (lease)** = a *signed* statement from the issuer: "user U owns features F until T". The app verifies the signature with an embedded **public key**, so it works offline until the lease expires.
- **Perpetual vs expiring:** yours is one-time → key never expires; but the *lease* is short (e.g. 14 days) so refunds/revocations propagate.

Security layers, in order of value:
1. Keys are long & random (Dodo generates them; ≥128 bits).
2. Server-side issuance/validation (you can revoke on refund/chargeback).
3. Activation limit + deactivate-from-UI (users reclaim slots when reinstalling).
4. Signed short-lived leases with asymmetric crypto (Ed25519) → no shared secret in the client.
5. Rate limiting + abuse monitoring on activate endpoint.
6. **Not worth doing in an open-source app:** obfuscation, anti-debug, hardware fingerprint lock-in (breaks on hardware change, trivially bypassed, hurts honest users).

### 3.2 Dodo Payments (verified against their docs)
- Create a **product** ($10, one-time) and a **License Key entitlement** (activation limit e.g. 3, no expiration, activation message with install steps) attached to it.
- Checkout: `POST /checkouts` (SDK: `client.checkoutSessions.create({ product_cart:[{product_id, quantity:1}], customer:{email}, return_url, cancel_url })`) → redirect to `checkout_url`. SDK: `npm i dodopayments`. **Set `environment: 'test_mode'` in dev** — the SDK defaults to live.
- Dodo auto-generates one key per unit on one-time purchases and emails it. Key is also appended to `return_url` as `?license_key=` — treat as sensitive, read it then strip it from history.
- **Public endpoints (no API key needed — safe for client software):**
  - `POST /licenses/activate` `{license_key, name}` → instance `id` (`lki_…`). Errors: 403 inactive, 404 unknown, 422 limit reached.
  - `POST /licenses/validate` `{license_key, license_key_instance_id?}` → `{valid}`.
  - `POST /licenses/deactivate` `{license_key, license_key_instance_id}`.
- **Never put your secret API key in the app.** Only the Account service holds it.
- **Webhooks** (Standard Webhooks): headers `webhook-id`, `webhook-timestamp`, `webhook-signature`; verify HMAC-SHA256 over `{id}.{timestamp}.{rawBody}` (secret `whsec_…` base64-decoded), constant-time compare, reject >5 min skew; dedupe on `webhook-id`; ack 200 fast, process async. Use the `standardwebhooks` package. Handle `payment.succeeded`, refund/dispute events and `entitlement_grant.revoked` (confirm exact refund/dispute names in Developer → Webhooks → Event Catalog; the public doc page doesn't list them).

### 3.3 Our flow

```
Buy:     app/web "Upgrade" ─▶ Account svc creates Dodo checkout (email prefilled from Google login)
         ─▶ Dodo hosted checkout ─▶ payment.succeeded webhook ─▶ Account svc
         records purchase {user_id|email, dodo_payment_id, license_key}; links to user.
Claim:   If buyer logged in with Google email == checkout email → auto-linked.
         Otherwise user pastes key (or opens return_url) after login → "claim".
Activate: client calls Account svc /license/activate {device_name, device_pubkey}
         → svc calls Dodo /licenses/activate → stores instance id lki_… → returns
         entitlement lease (Ed25519-signed JWT-like), bound to device_pubkey.
Run:     app verifies lease signature + expiry offline; refreshes every ~7 days
         (lease TTL 14 d; offline grace 30 d total so flights/outages never lock users out).
Revoke:  refund webhook → mark revoked → next refresh returns 402/revoked → features
         turn off, notes keep working (never hold user data hostage).
Reinstall: Settings → Devices → Deactivate (frees the slot) .
```

Lease payload (JWS, `alg: EdDSA`):
```json
{ "iss":"accounts.takenote.app","sub":"usr_123","lid":"lic_abc",
  "feat":["google","calendar","mcp_remote"],"dev":"<device key thumbprint>",
  "iat":1766000000,"exp":1767200000,"v":1 }
```
- Public key embedded in app builds (with a `kid` for rotation: ship 2 keys, rotate yearly).
- Device key: client generates an Ed25519 keypair, stores private key in OS keychain, signs refresh requests → a leaked lease alone can't be replayed on another machine.
- Clock tampering: record last-seen server time in lease refresh; if system clock goes backwards >24 h, require refresh.

Why proxy through our Account service instead of calling Dodo directly from the app? (a) offline-capable signed leases, (b) account linking to Google identity, (c) one place for rate limits/abuse, (d) can swap payment provider later. Cost: one more service to run. Acceptable because Google login already forces you to run it.

### 3.4 Data model (Account service)
```
users(id, google_sub, email, created_at)
licenses(id, user_id?, dodo_customer_id, dodo_payment_id, key_hash, status[active|revoked|refunded], created_at)
activations(id, license_id, dodo_instance_id, device_name, device_pubkey, last_seen_at, revoked_at)
webhook_events(webhook_id PK, type, received_at)     -- idempotency
google_tokens(user_id, refresh_token_enc, scopes, updated_at)
```
Store `key_hash` (SHA-256), not the raw key, after first display.

### 3.5 Edge cases to decide up front
Refund window policy (30 days?), chargeback → revoke, family/multiple devices (limit 3), key lost → email re-send via account, offline-only users (offer "paste lease file" fallback), test-mode vs live separation, price in regions (Dodo handles tax/merchant-of-record).

---

