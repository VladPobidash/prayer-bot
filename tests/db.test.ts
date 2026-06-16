import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, getDb, closeDb } from '../src/db/connection.ts';
import { getState, setState } from '../src/db/repo.ts';

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

test('getState/setState roundtrip with upsert', () => {
  initDb(':memory:');
  assert.equal(getState('missing'), null);
  setState('k', 'v1');
  assert.equal(getState('k'), 'v1');
  setState('k', 'v2');
  assert.equal(getState('k'), 'v2');
  closeDb();
});
