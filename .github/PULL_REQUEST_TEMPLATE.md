## PR rules

- Keep the PR focused: one feature/fix/docs change per PR.
- Do not mix refactors with behavior changes unless the refactor is required.
- Update docs/tests when behavior, commands, IPC/API contracts, security, WSL, or release flow changes.
- Do not mark real Windows/WSL behavior as verified unless it was run on a real Windows 11 + WSL2 host.
- Keep secrets, tokens, absolute private paths, and customer data out of commits, logs, screenshots, and PR text.
- Wait for required CI to pass before merge.

## Summary

<!-- What changed and why? -->

## Type of change

- [ ] Fix
- [ ] Feature
- [ ] Refactor
- [ ] Tests
- [ ] Docs
- [ ] Build/release/CI
- [ ] Security

## Scope / risk

- Risk level: <!-- low / medium / high -->
- User-visible impact:
- Filesystem/data-loss risk:
- Security/privacy impact:
- Rollback plan:

## Verification

- [ ] `npm run version:check`
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`

## Platform checks

- [ ] Windows local filesystem check not applicable, or described below
- [ ] Real-WSL check not applicable, or described below
- [ ] Packaging/installer check not applicable, or described below

### Manual evidence

<!-- Paste concise evidence: OS, commands, screenshots/log links, before/after behavior. -->

## Architecture checklist

- [ ] Renderer has no Node access and uses only the preload bridge.
- [ ] Preload exposes a narrow typed API, not generic IPC.
- [ ] Main/server resolve trusted workspace roots; renderer/client passes only `workspaceId` + `relativePath`.
- [ ] File writes preserve revision/CONFLICT semantics.
- [ ] Markdown files remain authoritative; derived indexes/caches are rebuildable.
- [ ] WSL commands use explicit argv / no shell interpolation.

## Screenshots / recordings

<!-- If UI changed, add before/after screenshots or a short recording. -->

## Follow-ups

<!-- Known gaps deliberately left for another PR. -->
