# Contributing to Prayer Bot

Thank you for your interest in contributing! This guide covers everything you
need to get a working development environment and open a pull request.

---

## Prerequisites

- **Node.js ≥ 24** — the bot runs directly via Node's native TypeScript
  type-stripping; no build step is required.
- **git**

---

## Setup

```bash
# 1. Fork this repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/prayer-bot.git
cd prayer-bot

# 2. Install dependencies (better-sqlite3 compiles a native binding)
npm install

# 3. Create a local .env with your bot token (not committed)
cp .env.example .env
# Open .env and set TELEGRAM_BOT_TOKEN=<your token from @BotFather>
```

---

## Run locally

```bash
npm start
```

This starts the bot in long-polling mode using your local `.env`. You should
see log lines like `[db] initialized`, `[server] listening on 3000`, and
`[bot] launched (long polling)`.

---

## Test

```bash
npm test
```

This runs two steps in sequence:

1. `tsc --noEmit` — type-checks all source and test files; must pass with zero
   errors before any other check.
2. `node --env-file=.env.test --test "tests/**/*.test.ts"` — runs all unit
   tests using Node's built-in test runner (no extra framework needed).

All tests must be green before opening a pull request.

---

## Code conventions

See **[CLAUDE.md](CLAUDE.md)** for the full Patterns reference. The short list:

- **Erasable-only TypeScript** — no `enum`, `namespace`, or parameter
  properties. Use `const` + union types. Import types with `import type` or
  inline `type` (`verbatimModuleSyntax` is on).
- **Explicit `.ts` import extensions** — write `import { x } from './utils.ts'`
  (required by Node's runtime resolver and `allowImportingTsExtensions`).
- **Bracketed log prefixes** — every `console.log` / `console.error` call
  starts with `[bot]`, `[db]`, `[scheduler]`, or `[server]` as appropriate.
- **All SQL lives in `src/db/`** — query statements (DML) in `repo.ts`, schema
  (DDL: `CREATE TABLE`, migrations) in `connection.ts`; no SQL in any other
  module. This keeps a future database swap cheap (touch only `connection.ts` +
  `repo.ts`).

---

## Pull request flow

1. **Fork** the repository and create a branch from `main`
   (`git checkout -b feat/my-feature`).
2. Make your changes; add or update tests as needed.
3. Run `npm test` and confirm everything is green.
4. Open a pull request against `main` on the upstream repository. Describe
   what the PR does and reference any related issues.

Small, focused PRs are easier to review and more likely to be merged quickly.

---

## Reporting issues

Use the [issue template](.github/ISSUE_TEMPLATE.md). Include your deploy
target (Railway or local), your Node version (`node -v`), and clear steps to
reproduce any bug.
