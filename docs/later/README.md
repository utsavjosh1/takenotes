# Later — demand-driven, paid, or server-backed work

**Rule:** nothing here is built until real users ask for it. The shipping product is free, MIT, and runs entirely on the user's machine (or their own self-hosted server). No accounts, no license checks, no hosted infrastructure, no recurring cost to the maintainer.

| File | What it holds | Build when… |
|---|---|---|
| `01-licensing-dodo.md` | License keys, activations, signed leases, Dodo Payments flow | Someone asks to pay / a paid tier is chosen |
| `02-accounts-and-cloud.md` | Google login, account service, hosted MCP auth, cloud calendar push, sync | Users ask for hosted convenience that can't be done locally |
| `03-pricing-and-cost-model.md` | Plans, quotas, Cloudflare cost model, refunds, device slots, public share links | Same trigger as above, **or** server costs appear |

## Triggers (write the ask down before building)
A feature moves out of `later/` only when **at least one** is true:
1. **3+ independent users** ask for it (GitHub issues/discussions count; link them in the PR).
2. A user offers to pay for it.
3. It cannot be delivered locally and a local workaround has been tried and rejected.

## How to activate an item
1. Open a GitHub Discussion: "Hosted X — would you pay? how much?" (cheap demand test).
2. Write the ADR (decision + monthly cost ceiling + kill switch).
3. Build behind a feature flag; keep the free local path untouched.
4. Only then publish pricing.

## Principles that stay true even later
- Notes are Markdown files the user owns; paid features never hold them hostage.
- A lapsed/revoked entitlement disables the *paid feature*, never access to notes.
- Anything with ongoing infra cost gets a quota or a recurring price. Never an unbounded promise on a one-time price.
- Self-hosting the same feature stays possible and documented.
