import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from '../src/scheduler.ts';

test('register wires the reminder job and returns stoppable tasks', () => {
  const tasks = register({ send: async () => 1 });
  assert.ok(tasks.length >= 1);
  for (const t of tasks) t.stop();
});
