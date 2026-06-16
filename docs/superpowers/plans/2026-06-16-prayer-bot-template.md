# Prayer-Bot Blank Framework Template — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a thin, open-source, TypeScript Telegram-bot framework skeleton — wiring + reusable patterns, zero prayer business logic — that runs build-free on Node ≥24 and deploys to Railway.

**Architecture:** Single long-lived Node process, layered (composition root → config → data → bot → background → presentation). Durable state in SQLite (WAL) behind a repository seam; long-polling transport + a tiny health server; in-process node-cron. All source is TypeScript, run directly via Node native type-stripping (no build step).

**Tech Stack:** Node ≥24 (ESM, native TS type-stripping), TypeScript 5.8 (`erasableSyntaxOnly`), Telegraf 4, better-sqlite3 11 (WAL), node-cron 4, dotenv. Tests via `node --test` + `tsc --noEmit`. Deploy on Railway (Volume-backed SQLite, long-polling).

**Conventions:**
- Imports use explicit `.ts` extensions (`import { x } from './utils.ts'`) — required by Node's runtime resolver + `allowImportingTsExtensions`.
- Erasable-only TS: no `enum`/`namespace`/parameter-properties. Use `const` + union types. `import type` / inline `type` for type-only imports (`verbatimModuleSyntax`).
- Bracketed-prefix logging: `[bot] [db] [scheduler] [server]`.
- **Never** mention any internal reference app or its tech in any file.
- Conventional-commit messages; commit after every green task.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `package.json` | ESM, `engines.node>=24`, scripts (`start`/`typecheck`/`test`), deps |
| `tsconfig.json` | Strip-safe TS config (`noEmit`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, nodenext) |
| `.gitignore` | Ignore `node_modules`, `.env`, `*.db*`, `/data` |
| `.env.example` | Documented variable checklist (mirrors Railway Variables) |
| `.env.test` | Committed dummy env for tests (`TELEGRAM_BOT_TOKEN=test-token`) |
| `src/preferences.ts` | Committed non-string tunables + log prefixes |
| `src/utils.ts` | `normalize()` (Cyrillic-safe), `withTimeout`, `withRetry` |
| `src/notify.ts` | `truncate()`, `lines()`, one keyboard builder |
| `src/config.ts` | `loadConfig(env)` → frozen `Config`; `Locale`/`SUPPORTED_LOCALES`; fail-fast |
| `src/i18n.ts` | `LOCALES` (uk/en/ru), `t()`, `resolveLocale()`, `LocaleKey` |
| `src/db/connection.ts` | better-sqlite3 singleton: `initDb`/`getDb`/`closeDb`, migrations, reconcile |
| `src/db/repo.ts` | The only SQL module: `getState`/`setState` (+ domain seam) |
| `src/server.ts` | `startHealthServer(port)` — `GET /health` |
| `src/bot.ts` | `createBot()` factory, admin middleware, commands, callback router, `safeEditMessageText` |
| `src/scheduler.ts` | `register({notify})` — node-cron heartbeat |
| `src/index.ts` | Composition root: wiring order, `reconcileOnBoot()`, graceful shutdown |
| `tests/*.test.ts` | `node --test` over pure logic + server + db |
| `railway.json` | Railway start command |
| `LICENSE` / `README.md` / `docs/SETUP.md` / `docs/USAGE.md` / `CONTRIBUTING.md` / `CODE_OF_CONDUCT.md` / `.github/ISSUE_TEMPLATE.md` / `CLAUDE.md` / `docs/architecture-decisions.md` | Open-source docs |

---

## Task 1: Toolchain bootstrap

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `.env.test`, `tests/sanity.test.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "prayer-bot",
  "version": "0.1.0",
  "description": "Open-source Telegram prayer bot for churches and small groups — prayer topics, reminders, and gamification.",
  "type": "module",
  "license": "MIT",
  "engines": { "node": ">=24" },
  "scripts": {
    "start": "node src/index.ts",
    "typecheck": "tsc --noEmit",
    "test": "npm run typecheck && node --env-file=.env.test --test \"tests/**/*.test.ts\""
  },
  "dependencies": {
    "better-sqlite3": "^11.8.1",
    "dotenv": "^16.4.7",
    "node-cron": "^4.2.1",
    "telegraf": "^4.16.3"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^24.0.0",
    "typescript": "^5.8.3"
  }
}
```

Note: `telegraf`, `dotenv`, and `node-cron` v4 ship their own type definitions, so only `@types/node` and `@types/better-sqlite3` are needed.

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "target": "esnext",
    "lib": ["esnext"],
    "types": ["node"],
    "noEmit": true,
    "strict": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "allowImportingTsExtensions": true,
    "rewriteRelativeImportExtensions": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 3: Create `.gitignore`**

```gitignore
node_modules/
.env
*.db
*.db-wal
*.db-shm
/data/
dist/
```

- [ ] **Step 4: Create `.env.example`**

```bash
# Required: your Telegram bot token from @BotFather
TELEGRAM_BOT_TOKEN=

# SQLite path. Defaults to ./data/prayer-bot.db locally.
# On Railway, set to your mounted Volume path, e.g. /data/prayer-bot.db
DB_PATH=

# Health-server port. Railway injects PORT automatically; defaults to 3000 locally.
PORT=

# Container timezone (IANA), e.g. Europe/Kyiv. Defaults to UTC.
TZ=

# Default UI locale: uk, en, or ru. Defaults to uk.
DEFAULT_LOCALE=

# Comma-separated Telegram user IDs allowed to run admin/write commands.
ADMIN_USER_IDS=

# Telegram chat ID to receive operator/error alerts (optional).
ADMIN_CHAT_ID=

# Cron expression for the demo heartbeat job. Defaults to hourly.
HEARTBEAT_CRON=
```

- [ ] **Step 5: Create `.env.test`** (committed; dummy values so `node --test` can import `config.ts`)

```bash
TELEGRAM_BOT_TOKEN=test-token
```

- [ ] **Step 6: Create `tests/sanity.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('toolchain runs TypeScript tests', () => {
  const doubled: number = [1, 2, 3].map((n) => n * 2).reduce((a, b) => a + b, 0);
  assert.equal(doubled, 12);
});
```

- [ ] **Step 7: Install dependencies**

Run: `npm install`
Expected: creates `node_modules/` and `package-lock.json`, no errors. (better-sqlite3 compiles its native binding.)

- [ ] **Step 8: Run the test suite**

Run: `npm test`
Expected: `tsc --noEmit` passes (no output) **then** node prints `# pass 1` for `sanity.test.ts`.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore .env.example .env.test tests/sanity.test.ts
git commit -m "chore: bootstrap TypeScript toolchain (Node type-stripping, node --test)"
```

---

## Task 2: `preferences.ts`

**Files:**
- Create: `src/preferences.ts`

- [ ] **Step 1: Create `src/preferences.ts`**

```ts
// Committed, code-reviewed tunables. No user-facing strings here (those live in i18n.ts).
export const TELEGRAM_MAX_LENGTH = 4096;
export const PAGE_SIZE = 10;

export const LOG_PREFIX = {
  bot: '[bot]',
  db: '[db]',
  scheduler: '[scheduler]',
  server: '[server]',
} as const;
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no output).

- [ ] **Step 3: Commit**

```bash
git add src/preferences.ts
git commit -m "feat: add preferences (tunables + log prefixes)"
```

---

## Task 3: `utils.ts` (Cyrillic-safe normalize, retry, timeout)

**Files:**
- Create: `src/utils.ts`
- Test: `tests/utils.test.ts`

- [ ] **Step 1: Write the failing test** — `tests/utils.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, withTimeout, withRetry } from '../src/utils.ts';

test('normalize lowercases and strips punctuation, keeps Latin', () => {
  assert.equal(normalize('Hello,  World!'), 'hello world');
});

test('normalize preserves Cyrillic (uk/ru) and digits', () => {
  assert.equal(normalize('  Привіт,  Світ! 123 '), 'привіт світ 123');
});

test('withTimeout rejects after the deadline', async () => {
  await assert.rejects(
    withTimeout(new Promise((r) => setTimeout(r, 50)), 10),
    /timeout/,
  );
});

test('withRetry returns once fn eventually succeeds', async () => {
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls += 1;
      if (calls < 3) throw new Error('flaky');
      return 'ok';
    },
    { retries: 5, delayMs: 1 },
  );
  assert.equal(result, 'ok');
  assert.equal(calls, 3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `tsc` errors that `../src/utils.ts` has no exports / cannot be found.

- [ ] **Step 3: Write `src/utils.ts`**

```ts
// Cyrillic-safe normalizer: lowercase, replace any run of non-letter/non-number
// with a single space, trim. \p{L}\p{N} with /u keeps uk/ru scripts intact.
export function normalize(input: string): string {
  return input.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; delayMs?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 3;
  const delayMs = opts.delayMs ?? 200;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise<void>((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — sanity + 4 utils tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils.ts tests/utils.test.ts
git commit -m "feat: add utils (Cyrillic-safe normalize, withTimeout, withRetry)"
```

---

## Task 4: `notify.ts` (truncate, lines, keyboard)

**Files:**
- Create: `src/notify.ts`
- Test: `tests/notify.test.ts`

- [ ] **Step 1: Write the failing test** — `tests/notify.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { truncate, lines } from '../src/notify.ts';

test('truncate leaves short text unchanged', () => {
  assert.equal(truncate('hello', 4096), 'hello');
});

test('truncate caps long text at the limit', () => {
  const long = 'x'.repeat(5000);
  const out = truncate(long, 4096);
  assert.ok(out.length <= 4096);
  assert.ok(out.endsWith('(truncated)'));
});

test('lines joins non-empty entries and drops null/undefined', () => {
  assert.equal(lines(['a', null, 'b', undefined, 'c']), 'a\nb\nc');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `../src/notify.ts` not found by `tsc`.

- [ ] **Step 3: Write `src/notify.ts`**

```ts
import { Markup } from 'telegraf';
import { TELEGRAM_MAX_LENGTH } from './preferences.ts';

const ELLIPSIS = '\n… (truncated)';

export function truncate(text: string, max: number = TELEGRAM_MAX_LENGTH): string {
  if (text.length <= max) return text;
  return text.slice(0, max - ELLIPSIS.length) + ELLIPSIS;
}

export function lines(items: Array<string | null | undefined>): string {
  return items.filter((x): x is string => typeof x === 'string').join('\n');
}

// One keyboard-builder example (single convention: Telegraf Markup).
export function confirmKeyboard(yesData: string, noData: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅', yesData), Markup.button.callback('❌', noData)],
  ]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — 3 notify tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/notify.ts tests/notify.test.ts
git commit -m "feat: add notify (truncate, lines, keyboard builder)"
```

---

## Task 5: `config.ts` (typed, fail-fast, locale-aware)

**Files:**
- Create: `src/config.ts`
- Test: `tests/config.test.ts`

- [ ] **Step 1: Write the failing test** — `tests/config.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.ts';

const base = { TELEGRAM_BOT_TOKEN: 'x' } as NodeJS.ProcessEnv;

test('throws when a required var is missing', () => {
  assert.throws(() => loadConfig({} as NodeJS.ProcessEnv), /TELEGRAM_BOT_TOKEN/);
});

test('applies sensible defaults', () => {
  const c = loadConfig({ ...base });
  assert.equal(c.dbPath, './data/prayer-bot.db');
  assert.equal(c.port, 3000);
  assert.equal(c.tz, 'UTC');
  assert.equal(c.defaultLocale, 'uk');
  assert.equal(c.adminChatId, null);
});

test('PORT="0" is respected (not coerced to the default)', () => {
  const c = loadConfig({ ...base, PORT: '0' });
  assert.equal(c.port, 0);
});

test('ADMIN_USER_IDS parses into a Set of numbers', () => {
  const c = loadConfig({ ...base, ADMIN_USER_IDS: ' 1, 2 ,3 ' });
  assert.deepEqual([...c.adminUserIds].sort((a, b) => a - b), [1, 2, 3]);
});

test('invalid DEFAULT_LOCALE falls back to uk', () => {
  const c = loadConfig({ ...base, DEFAULT_LOCALE: 'xx' });
  assert.equal(c.defaultLocale, 'uk');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `../src/config.ts` not found.

- [ ] **Step 3: Write `src/config.ts`**

```ts
import 'dotenv/config';

export const SUPPORTED_LOCALES = ['uk', 'en', 'ru'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export interface Config {
  telegramBotToken: string;
  dbPath: string;
  port: number;
  tz: string;
  defaultLocale: Locale;
  adminUserIds: Set<number>;
  adminChatId: number | null;
  heartbeatCron: string;
}

const REQUIRED = ['TELEGRAM_BOT_TOKEN'] as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  for (const key of REQUIRED) {
    if (!env[key]) throw new Error(`Missing required env var: ${key}`);
  }

  const localeRaw = env.DEFAULT_LOCALE ?? 'uk';
  const defaultLocale: Locale =
    (SUPPORTED_LOCALES as readonly string[]).includes(localeRaw)
      ? (localeRaw as Locale)
      : 'uk';

  const adminUserIds = new Set(
    (env.ADMIN_USER_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n)),
  );

  return Object.freeze({
    telegramBotToken: env.TELEGRAM_BOT_TOKEN as string,
    dbPath: env.DB_PATH ?? './data/prayer-bot.db',
    port: env.PORT !== undefined && env.PORT !== '' ? Number(env.PORT) : 3000,
    tz: env.TZ ?? 'UTC',
    defaultLocale,
    adminUserIds,
    adminChatId:
      env.ADMIN_CHAT_ID !== undefined && env.ADMIN_CHAT_ID !== ''
        ? Number(env.ADMIN_CHAT_ID)
        : null,
    heartbeatCron: env.HEARTBEAT_CRON ?? '0 * * * *',
  });
}

// Eager load = fail-fast at boot (a missing var crashes with a one-line log).
const config = loadConfig();
export default config;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — 5 config tests pass. (`.env.test` supplies the token so the eager `loadConfig()` at import doesn't throw.)

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add typed fail-fast config with locale validation"
```

---

## Task 6: `i18n.ts` (uk/en/ru + t())

**Files:**
- Create: `src/i18n.ts`
- Test: `tests/i18n.test.ts`

- [ ] **Step 1: Write the failing test** — `tests/i18n.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t } from '../src/i18n.ts';

test('returns the requested locale string', () => {
  assert.equal(t('en', 'help').startsWith('Commands'), true);
});

test('unknown locale falls back to the default (uk)', () => {
  assert.equal(t('xx', 'help').startsWith('Команди'), true);
});

test('interpolates {vars}', () => {
  assert.equal(t('en', 'greeting', { name: 'Sam' }), 'Hello, Sam!');
});

test('leaves an unsupplied placeholder intact', () => {
  assert.equal(t('en', 'greeting', {}), 'Hello, {name}!');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `../src/i18n.ts` not found.

- [ ] **Step 3: Write `src/i18n.ts`**

```ts
import config, { type Locale } from './config.ts';

export const LOCALES = {
  uk: {
    start: 'Вітаю! Я бот-помічник для молитви. Напишіть /help, щоб побачити команди.',
    help: 'Команди:\n/start — почати\n/help — довідка\n/ping — перевірка зв’язку',
    ping: 'pong',
    greeting: 'Вітаю, {name}!',
    unknownCommand: 'Невідома команда. Спробуйте /help.',
  },
  en: {
    start: 'Hi! I’m a prayer helper bot. Send /help to see the commands.',
    help: 'Commands:\n/start — get started\n/help — this help\n/ping — connectivity check',
    ping: 'pong',
    greeting: 'Hello, {name}!',
    unknownCommand: 'Unknown command. Try /help.',
  },
  ru: {
    start: 'Привет! Я бот-помощник для молитвы. Напишите /help, чтобы увидеть команды.',
    help: 'Команды:\n/start — начать\n/help — справка\n/ping — проверка связи',
    ping: 'pong',
    greeting: 'Здравствуйте, {name}!',
    unknownCommand: 'Неизвестная команда. Попробуйте /help.',
  },
} as const;

export type LocaleKey = keyof (typeof LOCALES)['uk'];

type Dict = Record<LocaleKey, string>;

export function t(
  locale: string,
  key: LocaleKey,
  vars: Record<string, string | number> = {},
): string {
  const table = LOCALES as Record<string, Dict>;
  const dict = table[locale] ?? table[config.defaultLocale];
  const template = dict[key] ?? table[config.defaultLocale][key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) =>
    name in vars ? String(vars[name]) : `{${name}}`,
  );
}

// TODO: once groups/users carry a locale in the DB, resolve it per-chat here.
export function resolveLocale(_ctx: unknown): Locale {
  return config.defaultLocale;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — 4 i18n tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/i18n.ts tests/i18n.test.ts
git commit -m "feat: add i18n (uk/en/ru) with fallback + interpolation"
```

---

## Task 7: `db/connection.ts` (singleton, WAL, migrations, reconcile)

**Files:**
- Create: `src/db/connection.ts`
- Test: `tests/db.test.ts` (shared with Task 8)

- [ ] **Step 1: Write the failing test** — `tests/db.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, getDb, closeDb } from '../src/db/connection.ts';

test('getDb throws before initDb', () => {
  closeDb();
  assert.throws(() => getDb(), /not initialized/);
});

test('initDb opens an in-memory db and creates bot_state', () => {
  const db = initDb(':memory:');
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bot_state'")
    .get();
  assert.ok(row);
  closeDb();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `../src/db/connection.ts` not found.

- [ ] **Step 3: Write `src/db/connection.ts`**

```ts
import Database from 'better-sqlite3';
import type { Database as DB } from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import config from '../config.ts';
import { LOG_PREFIX } from '../preferences.ts';

let db: DB | null = null;

export function initDb(path: string = config.dbPath): DB {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  db = new Database(path);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS bot_state (
      key   TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  runMigrations(db);
  reconcile(db);
  console.log(`${LOG_PREFIX.db} initialized at ${path}`);
  return db;
}

// Additive, PRAGMA-guarded migrations. None yet — worked-example pattern:
//   const cols = db.prepare(`PRAGMA table_info(bot_state)`).all();
//   if (!cols.some((c) => (c as { name: string }).name === 'updated_at')) {
//     db.exec(`ALTER TABLE bot_state ADD COLUMN updated_at TEXT`);
//   }
function runMigrations(_db: DB): void {}

// Recover transient state after a restart. No-op until the domain adds rows
// (e.g. UPDATE reminders SET status='pending' WHERE status='sending'); the hook
// exists so reconcile-on-boot has a home.
function reconcile(_db: DB): void {}

export function getDb(): DB {
  if (!db) throw new Error('DB not initialized — call initDb() first');
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — 2 db connection tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/db/connection.ts tests/db.test.ts
git commit -m "feat: add better-sqlite3 singleton (WAL, migrations, reconcile hooks)"
```

---

## Task 8: `db/repo.ts` (the SQL seam)

**Files:**
- Create: `src/db/repo.ts`
- Test: append to `tests/db.test.ts`

- [ ] **Step 1: Add the failing test** — append to `tests/db.test.ts`

```ts
import { getState, setState } from '../src/db/repo.ts';

test('getState/setState roundtrip with upsert', () => {
  initDb(':memory:');
  assert.equal(getState('missing'), null);
  setState('k', 'v1');
  assert.equal(getState('k'), 'v1');
  setState('k', 'v2');
  assert.equal(getState('k'), 'v2');
  closeDb();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `../src/db/repo.ts` not found.

- [ ] **Step 3: Write `src/db/repo.ts`**

```ts
import { getDb } from './connection.ts';

export interface BotState {
  key: string;
  value: string;
}

export function getState(key: string): string | null {
  const row = getDb()
    .prepare('SELECT value FROM bot_state WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setState(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO bot_state (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}

// ───────────────────────────────────────────────────────────────────────────
// Prayer-domain repo functions go here (added with the domain). Keep ALL SQL in
// this module so a future Postgres swap touches only connection.ts + repo.ts.
// ───────────────────────────────────────────────────────────────────────────
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — repo roundtrip test passes.

- [ ] **Step 5: Commit**

```bash
git add src/db/repo.ts tests/db.test.ts
git commit -m "feat: add repo seam (bot_state get/set via UPSERT)"
```

---

## Task 9: `server.ts` (health endpoint)

**Files:**
- Create: `src/server.ts`
- Test: `tests/server.test.ts`

- [ ] **Step 1: Write the failing test** — `tests/server.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { startHealthServer } from '../src/server.ts';

test('GET /health → 200 ok; unknown route → 404', async () => {
  const server = startHealthServer(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  const { port } = server.address() as AddressInfo;

  const ok = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { status: 'ok' });

  const notFound = await fetch(`http://127.0.0.1:${port}/nope`);
  assert.equal(notFound.status, 404);

  await new Promise<void>((r) => server.close(() => r()));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `../src/server.ts` not found.

- [ ] **Step 3: Write `src/server.ts`**

```ts
import { createServer, type Server } from 'node:http';
import { LOG_PREFIX } from './preferences.ts';

export function startHealthServer(port: number): Server {
  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });
  server.listen(port, () => {
    const addr = server.address();
    const shown = typeof addr === 'object' && addr ? addr.port : port;
    console.log(`${LOG_PREFIX.server} listening on ${shown}`);
  });
  return server;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — server test passes.

- [ ] **Step 5: Commit**

```bash
git add src/server.ts tests/server.test.ts
git commit -m "feat: add health HTTP server (GET /health)"
```

---

## Task 10: `bot.ts` (factory, middleware, commands, router)

**Files:**
- Create: `src/bot.ts`
- Test: `tests/bot.test.ts`

- [ ] **Step 1: Write the failing test** — `tests/bot.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Telegraf } from 'telegraf';
import { createBot, safeEditMessageText } from '../src/bot.ts';

test('createBot returns a Telegraf instance and does not launch', () => {
  const bot = createBot('123456:FAKE');
  assert.ok(bot instanceof Telegraf);
});

test('safeEditMessageText swallows "message is not modified"', async () => {
  const ctx = {
    editMessageText: async () => {
      throw { description: 'Bad Request: message is not modified' };
    },
  };
  await assert.doesNotReject(() => safeEditMessageText(ctx as never, 'x'));
});

test('safeEditMessageText rethrows other errors', async () => {
  const ctx = {
    editMessageText: async () => { throw new Error('network down'); },
  };
  await assert.rejects(() => safeEditMessageText(ctx as never, 'x'), /network down/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `../src/bot.ts` not found.

- [ ] **Step 3: Write `src/bot.ts`**

```ts
import { Telegraf, type Context } from 'telegraf';
import config from './config.ts';
import { LOG_PREFIX } from './preferences.ts';
import { t, resolveLocale } from './i18n.ts';

export function createBot(token: string = config.telegramBotToken): Telegraf {
  const bot = new Telegraf(token);

  // Admin gate: blocks ONLY write/admin commands for non-admins, and does so
  // SILENTLY (never replies "Unauthorized" — that gets a group bot muted/kicked).
  // No write commands exist yet, so isWriteCommand() matches nothing.
  bot.use(async (ctx, next) => {
    if (isWriteCommand(ctx) && !isAdmin(ctx)) return;
    return next();
  });

  bot.command('start', (ctx) => ctx.reply(t(resolveLocale(ctx), 'start')));
  bot.command('help', (ctx) => ctx.reply(t(resolveLocale(ctx), 'help')));
  bot.command('ping', (ctx) => ctx.reply(t(resolveLocale(ctx), 'ping')));

  // Single callback_query router: "namespace:action:id". Carry only a short id;
  // resolve real state server-side (callback_data is capped at 64 bytes).
  bot.on('callback_query', async (ctx) => {
    const data = (ctx.callbackQuery as { data?: string }).data ?? '';
    const [namespace, action, id] = data.split(':');
    await ctx.answerCbQuery();
    switch (`${namespace}:${action}`) {
      case 'demo:noop':
        console.log(`${LOG_PREFIX.bot} demo:noop id=${id}`);
        break;
      default:
        console.log(`${LOG_PREFIX.bot} stale callback: ${data}`);
    }
  });

  bot.catch((err) => {
    console.error(`${LOG_PREFIX.bot} handler error:`, err);
  });

  return bot;
}

// Domain write-commands (e.g. /topic add) return true here so the middleware
// gates them by admin id. Nothing to gate in the skeleton.
function isWriteCommand(_ctx: Context): boolean {
  return false;
}

function isAdmin(ctx: Context): boolean {
  return ctx.from ? config.adminUserIds.has(ctx.from.id) : false;
}

export async function safeEditMessageText(
  ctx: Context,
  text: string,
  extra?: Parameters<Context['editMessageText']>[1],
): Promise<void> {
  try {
    await ctx.editMessageText(text, extra);
  } catch (err) {
    const e = err as { description?: string; message?: string };
    const msg = e.description ?? e.message ?? '';
    if (!/message is not modified/i.test(msg)) throw err;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — 3 bot tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/bot.ts tests/bot.test.ts
git commit -m "feat: add bot factory (admin gate, commands, callback router, safe edit)"
```

---

## Task 11: `scheduler.ts` (node-cron heartbeat)

**Files:**
- Create: `src/scheduler.ts`
- Test: `tests/scheduler.test.ts`

- [ ] **Step 1: Write the failing test** — `tests/scheduler.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from '../src/scheduler.ts';

test('register wires the heartbeat and returns stoppable tasks', () => {
  const tasks = register({ notify: () => {} });
  assert.ok(Array.isArray(tasks));
  assert.ok(tasks.length >= 1);
  // Stop tasks so their timers do not keep the test process alive.
  for (const task of tasks) task.stop();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `../src/scheduler.ts` not found.

- [ ] **Step 3: Write `src/scheduler.ts`**

```ts
import cron, { type ScheduledTask } from 'node-cron';
import config from './config.ts';
import { LOG_PREFIX } from './preferences.ts';

export type Notify = (
  chatId: number,
  text: string,
  extra?: unknown,
) => Promise<unknown> | void;

export interface SchedulerDeps {
  notify: Notify;
}

// Each job is feature-flagged and fault-isolated (per-tick try/catch). The
// heartbeat is the worked example; replace/extend with domain jobs later.
export function register(_deps: SchedulerDeps): ScheduledTask[] {
  const tasks: ScheduledTask[] = [];

  if (config.heartbeatCron) {
    tasks.push(
      cron.schedule(
        config.heartbeatCron,
        () => {
          try {
            console.log(`${LOG_PREFIX.scheduler} heartbeat`);
          } catch (err) {
            console.error(`${LOG_PREFIX.scheduler} heartbeat failed:`, err);
          }
        },
        { timezone: config.tz },
      ),
    );
    console.log(`${LOG_PREFIX.scheduler} heartbeat scheduled: ${config.heartbeatCron}`);
  }

  return tasks;
}
```

If `tsc` reports an unknown option for the third argument, consult the installed node-cron v4 typings (`node_modules/node-cron`) and adjust the options object — the `{ timezone }` shape is stable in v4.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — scheduler test passes and the process exits cleanly (tasks stopped).

- [ ] **Step 5: Commit**

```bash
git add src/scheduler.ts tests/scheduler.test.ts
git commit -m "feat: add scheduler (node-cron heartbeat, injected notify)"
```

---

## Task 12: `index.ts` (composition root) + manual boot

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Write `src/index.ts`**

```ts
import config from './config.ts';
import { initDb, closeDb } from './db/connection.ts';
import { getState, setState } from './db/repo.ts';
import { createBot } from './bot.ts';
import { startHealthServer } from './server.ts';
import { register as registerSchedules, type Notify } from './scheduler.ts';
import { LOG_PREFIX } from './preferences.ts';

// Last-resort guards so a detached promise (cron/worker) logs instead of crashing.
process.on('unhandledRejection', (err) => {
  console.error('[fatal] unhandled rejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaught exception:', err);
});

// Order is the contract: persistence → client → senders → launch → schedules.
initDb();

const bot = createBot();

const notify: Notify = (chatId, text, extra) =>
  bot.telegram.sendMessage(
    chatId,
    text,
    extra as Parameters<typeof bot.telegram.sendMessage>[2],
  );

const server = startHealthServer(config.port);

bot.launch();
console.log(`${LOG_PREFIX.bot} launched (long polling)`);

reconcileOnBoot();
registerSchedules({ notify });

const shutdown = () => {
  console.log('Shutting down…');
  bot.stop('SIGTERM');
  server.close();
  closeDb();
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

// Empty-but-real: records boot time; reminder/streak recovery hooks here later.
function reconcileOnBoot(): void {
  const last = getState('last_processed_at');
  console.log(`${LOG_PREFIX.bot} reconcile-on-boot (last_processed_at=${last ?? 'none'})`);
  setState('last_processed_at', new Date().toISOString());
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no output).

- [ ] **Step 3: Manual boot smoke test** (needs a real bot token from @BotFather)

Create a local `.env` (not committed) with `TELEGRAM_BOT_TOKEN=<real token>`, then run: `npm start`
Expected logs (order may vary slightly):
```
[db] initialized at ./data/prayer-bot.db
[server] listening on 3000
[bot] launched (long polling)
[bot] reconcile-on-boot (last_processed_at=none)
[scheduler] heartbeat scheduled: 0 * * * *
```
Then, in a separate terminal: `curl http://localhost:3000/health` → `{"status":"ok"}`.
In Telegram, message the bot `/ping` → it replies `pong`; `/start` and `/help` reply in `uk`.
Press Ctrl+C → logs `Shutting down…` and exits cleanly.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: add composition root (wiring, reconcile-on-boot, graceful shutdown)"
```

---

## Task 13: `railway.json`

**Files:**
- Create: `railway.json`

- [ ] **Step 1: Create `railway.json`**

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add railway.json
git commit -m "chore: add Railway service config (Nixpacks, npm start)"
```

---

## Task 14: User-facing docs (LICENSE, README, SETUP, USAGE)

**Files:**
- Create: `LICENSE`, `README.md`, `docs/SETUP.md`, `docs/USAGE.md`

- [ ] **Step 1: Create `LICENSE`** (MIT — replace name/year only if desired)

```text
MIT License

Copyright (c) 2026 Vlad Pobidash

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Create `README.md`** with these sections, in this order, in plain language (assume a non-developer reader). Use this exact top block, then fill the rest from the content notes:

```markdown
# 🙏 Prayer Bot

A free, open-source Telegram bot for churches and small groups: organize prayer
topics, send reminders, and keep everyone encouraged with gentle gamification.
Deploy your own in about 10 minutes — no coding required.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **Status:** framework template. The core bot runs today (`/start`, `/help`,
> `/ping`); prayer topics, reminders, and gamification are on the roadmap.
```

Then include:
- **Who it's for** — churches, ministries, small groups who want a private prayer bot they control.
- **Features** — a short bullet list (today: multi-language uk/en/ru, health-checked, durable storage; roadmap: prayer topics, reminders, streaks/leaderboards).
- **Deploy your own (~10 minutes)** — 1–2 sentence summary, then "Full step-by-step: see [docs/SETUP.md](docs/SETUP.md)."
- **Using the bot** — "See [docs/USAGE.md](docs/USAGE.md)."
- **Run locally (for developers)** — a collapsed `<details>` block: `git clone`, `npm install`, copy `.env.example` → `.env`, add token, `npm start`; and `npm test`. State the requirement: **Node ≥ 24**.
- **Contributing** — link to `CONTRIBUTING.md`.
- **License** — MIT, link to `LICENSE`.

- [ ] **Step 3: Create `docs/SETUP.md`** — numbered, copy-paste, beginner-first:
  1. **Create your bot** — message [@BotFather](https://t.me/BotFather), send `/newbot`, follow prompts, copy the token.
  2. **Deploy on Railway** — two paths:
     - *One-click:* click the **Deploy on Railway** button in the README. (Maintainer note in a callout: after first publishing the repo, create a Railway Template and replace the button URL with your template link so this prompts for the token automatically.)
     - *Manual:* in Railway, **New Project → Deploy from GitHub repo**, pick your fork.
  3. **Add a Volume** — in the service, **Settings → Volumes → add a volume mounted at `/data`** (this is where prayer data is stored; without it, data is wiped on every redeploy).
  4. **Set variables** — under **Variables**, add `TELEGRAM_BOT_TOKEN` (your token) and `DB_PATH=/data/prayer-bot.db`. Optionally `DEFAULT_LOCALE`, `TZ` (e.g. `Europe/Kyiv`), `ADMIN_USER_IDS`.
  5. **Verify** — open the service URL `/health` (should show `{"status":"ok"}`), then message your bot `/ping` (should reply `pong`).
  - **Troubleshooting** box: bot silent → check the token; data disappears after deploy → the Volume is missing or `DB_PATH` doesn't point at `/data`; reminders at the wrong time (future) → set `TZ`.

- [ ] **Step 4: Create `docs/USAGE.md`** — commands table (`/start`, `/help`, `/ping`), a note that admin-only commands are gated by `ADMIN_USER_IDS`, and a language note (`DEFAULT_LOCALE` = `uk`/`en`/`ru`; per-chat language switching is on the roadmap). Keep it short; note it grows as features land.

- [ ] **Step 5: Commit**

```bash
git add LICENSE README.md docs/SETUP.md docs/USAGE.md
git commit -m "docs: add LICENSE (MIT) and user-facing README/SETUP/USAGE"
```

---

## Task 15: Contributor docs (CONTRIBUTING, CoC, issue template, CLAUDE.md, ADRs)

**Files:**
- Create: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `.github/ISSUE_TEMPLATE.md`, `CLAUDE.md`, `docs/architecture-decisions.md`

- [ ] **Step 1: Create `CONTRIBUTING.md`** — prerequisites (**Node ≥ 24**, git), setup (`npm install`), run (`npm start` with a local `.env`), test (`npm test` = `tsc --noEmit` + `node --test`), conventions (link to CLAUDE.md Patterns; erasable-only TS; `.ts` import extensions; bracketed log prefixes; keep all SQL in `src/db/repo.ts`), and how to open a PR (fork → branch → tests green → PR).

- [ ] **Step 2: Create `CODE_OF_CONDUCT.md`** — adopt the Contributor Covenant. Include this complete short text:

```markdown
# Contributor Covenant Code of Conduct

We as members, contributors, and leaders pledge to make participation in our
community a harassment-free experience for everyone, regardless of age, body
size, visible or invisible disability, ethnicity, sex characteristics, gender
identity and expression, level of experience, education, socio-economic status,
nationality, personal appearance, race, religion, or sexual identity and
orientation.

We pledge to act and interact in ways that contribute to an open, welcoming,
diverse, inclusive, and healthy community.

Examples of unacceptable behavior include harassment, insulting or derogatory
comments, and personal or political attacks.

Project maintainers are responsible for clarifying standards and may remove,
edit, or reject contributions that are not aligned with this Code of Conduct.

Instances of abusive behavior may be reported to the project maintainers at
the contact in this repository. All complaints will be reviewed and
investigated promptly and fairly.

This Code of Conduct is adapted from the Contributor Covenant, version 2.1,
available at https://www.contributor-covenant.org/version/2/1/code_of_conduct/.
```

- [ ] **Step 3: Create `.github/ISSUE_TEMPLATE.md`**

```markdown
**What happened?**
A clear description of the bug or question.

**Steps to reproduce (for bugs)**
1.
2.

**Expected vs actual**

**Environment**
- Deploy target: Railway / local
- Node version (`node -v`):
```

- [ ] **Step 4: Create `CLAUDE.md`** — a per-module map (one line each for `index.ts`, `config.ts`, `preferences.ts`, `i18n.ts`, `db/connection.ts`, `db/repo.ts`, `bot.ts`, `scheduler.ts`, `notify.ts`, `utils.ts`, `server.ts`) plus a **Patterns** section: composition-root wiring order; setter/closure-injected `notify`; SQLite singleton + repo seam; `createBot()` factory (no launch); single callback prefix-router; persist-in-SQLite vs ephemeral-Map boundary; erasable-only TypeScript + `.ts` import extensions; bracketed log prefixes. Include a **Build & Run** block (`npm install`, `npm start`, `npm test`) noting **Node ≥ 24** and no build step.

- [ ] **Step 5: Create `docs/architecture-decisions.md`** — six ADRs, each with Status / Context / Decision / Consequences (2–4 sentences each):
  1. Telegram **long-polling** vs webhook on Railway (→ long-polling for v1; webhooks deferred).
  2. **SQLite on a Railway Volume**, abstracted behind `db/repo.ts`, vs managed Postgres (→ SQLite now; repo seam keeps the swap cheap).
  3. **In-process node-cron + reconcile-on-boot** vs Railway Cron (→ in-process; persisted state recovers missed ticks).
  4. **Group-safe auth**: admin-gating + silent-on-chatter vs a closed allow-list (→ silent admin gate).
  5. **Railway restart policy + graceful SIGTERM** with no external supervisor (→ `db.close()` on shutdown flushes WAL).
  6. **TypeScript via Node native type-stripping** vs a `tsc` build vs plain JS (→ type-stripping; no build step; `erasableSyntaxOnly` enforces strip-safe syntax; `tsc --noEmit` type-checks in CI).

- [ ] **Step 6: Commit**

```bash
git add CONTRIBUTING.md CODE_OF_CONDUCT.md .github/ISSUE_TEMPLATE.md CLAUDE.md docs/architecture-decisions.md
git commit -m "docs: add contributor guide, code of conduct, CLAUDE.md, and ADRs"
```

---

## Task 16: Final verification & polish

**Files:** none created — verification only

- [ ] **Step 1: Full test run**

Run: `npm test`
Expected: `tsc --noEmit` passes; all test files pass (`sanity`, `utils`, `notify`, `config`, `i18n`, `db`, `server`, `bot`, `scheduler`). No open-handle hang.

- [ ] **Step 2: Leak check — no private references or stray `.js` module refs**

Review the full diff and confirm no internal/private project names or unrelated
(non-prayer) domain terms were inadvertently carried into any file. Then confirm every
source import uses an explicit `.ts` extension and no local module is referenced as `.js`
(only `Node.js` and `*.json` filenames may legitimately contain `.js`/`.json`).

- [ ] **Step 3: Confirm the Definition of Done (spec §15)** — tests pass; `npm start` boots (Task 12 smoke); a Volume-backed Railway deploy survives a redeploy; LICENSE + README + SETUP + USAGE + CONTRIBUTING + CLAUDE.md + tsconfig + 6 ADRs present and cross-linked; no business logic; extension points commented.

- [ ] **Step 4: Final commit (if anything was touched)**

```bash
git add -A
git commit -m "chore: final verification pass for the template skeleton"
```

---

## Self-Review (completed by plan author)

**Spec coverage:** Every spec section maps to a task — §5 layout → Tasks 2–13; §6 module specs → Tasks 2–12; §7 data model (`bot_state`) → Task 7; §8 env → Task 1 (`.env.example`) + Task 5 (`config.ts`); §9 i18n → Task 6; §10 error handling → Tasks 10/11/12; §11 Railway → Tasks 13/14; §12 testing → Tasks 3–11; §13 conventions → header + CLAUDE.md (Task 15); §14 ADRs → Task 15; §15 DoD → Task 16; §16 docs → Tasks 14/15.

**Placeholder scan:** Code steps contain full code; doc steps give concrete content or exact section/content lists. The only intentional deferrals are domain extension points, clearly commented in-code.

**Type consistency:** `Config`/`Locale`/`SUPPORTED_LOCALES` (config.ts) are consumed unchanged by i18n.ts and bot.ts; `t(locale, key, vars)` and `LocaleKey` match across i18n.ts and its tests; `getState`/`setState` signatures match across repo.ts, index.ts, and db tests; `Notify`/`register` match across scheduler.ts and index.ts; `getDb`/`initDb`/`closeDb` match across connection.ts, repo.ts, and index.ts.
