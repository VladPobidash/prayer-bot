import { test } from 'node:test';
import assert from 'node:assert/strict';

test('toolchain runs TypeScript tests', () => {
  const doubled: number = [1, 2, 3].map((n) => n * 2).reduce((a, b) => a + b, 0);
  assert.equal(doubled, 12);
});
