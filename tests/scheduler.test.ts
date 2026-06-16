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
