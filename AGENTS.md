# Prayer Bot contributor guide

Read [CLAUDE.md](CLAUDE.md) before changing code. It is the maintained module
map and explains the architecture, data flow, and project conventions. This
file is deliberately short so it can serve as the repository entry point for
any coding agent or contributor.

## Quick start

```bash
npm install
npm test
```

The application requires Node.js 24 or later and runs TypeScript directly; do
not add a build-output directory or a transpilation step. Use `.env.example`
as the configuration reference. Tests load the committed `.env.test` and use
in-memory SQLite databases, so they do not require a Telegram token or a
network connection.

## Change boundaries

- Keep local imports explicit with the `.ts` extension and use only erasable
  TypeScript syntax.
- Keep schema DDL and migrations in `src/db/connection.ts`; keep all SQL query
  logic in `src/db/repo.ts`. Domain and bot modules must not access `getDb()`
  directly.
- Preserve the dependency direction: pure UI/helpers → domain modules →
  repository → SQLite. Telegraf wiring stays in `src/bot.ts` and `src/index.ts`.
- Authorize actions for the specific prayer room at the handler/domain boundary;
  do not reintroduce a global user allow-list.
- Add or update focused `node:test` coverage for changed behavior. Run `npm
  test` before submitting a change.

## Documentation maintenance

Update the relevant user-facing document when changing bot behavior:

- `README.md` for the feature summary and local-development entry point.
- `docs/SETUP.md` for deployment/configuration.
- `docs/USAGE.md` for Telegram behavior.
- `docs/architecture-decisions.md` for a durable architectural decision.
- `CLAUDE.md` when module responsibilities, data flow, or coding conventions
  change.
