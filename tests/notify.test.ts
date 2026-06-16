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
