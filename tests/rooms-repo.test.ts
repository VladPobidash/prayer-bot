import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, getDb, closeDb } from '../src/db/connection.ts';

test('initDb creates the prayer-room tables', () => {
  const db = initDb(':memory:');
  const names = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r) => (r as { name: string }).name);
  for (const t of ['users', 'rooms', 'room_members', 'topics', 'topic_updates']) {
    assert.ok(names.includes(t), `missing table: ${t}`);
  }
  closeDb();
});
