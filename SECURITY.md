# Security policy

Early foundation project — no stable release yet.

- Do not commit certificates, PFX files, passwords, or private keys. Future
  signing credentials belong in GitHub Secrets / a secure signing provider.
- Report vulnerabilities by opening a private channel with the maintainer
  (no public exploit details in issues until triaged).
- Security model and honest MVP limitations: see `docs/security.md` and
  `docs/decisions/ADR-0004-filesystem-safety.md`.
