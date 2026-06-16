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
