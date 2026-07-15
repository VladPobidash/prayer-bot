import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from '../src/scheduler.ts';

test('register wires the reminder + accountability jobs and returns stoppable tasks', () => {
  const tasks = register({ send: async () => 1, notify: async () => {} });
  assert.ok(tasks.length >= 2);
  for (const t of tasks) t.stop();
});
