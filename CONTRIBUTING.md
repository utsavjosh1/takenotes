# Contributing

- Conventional Commits (`feat(editor): …`, `fix(files): …`, `docs(…)`,
  `ci(…)`, `chore(release): …`). Avoid `update`, `misc`, `fix`.
- Quality gate before merge: `npm ci`, `npm run version:check`,
  `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- Never claim `tested/working/verified/released` without the executed command.
- One language family (TS/JS/Node), one package manager (npm). Native addons
  or a second language need an ADR first.
