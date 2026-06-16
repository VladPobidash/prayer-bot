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
