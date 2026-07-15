import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMissStreak, decideAction } from '../src/accountability.ts';

test('computeMissStreak counts full missed days ending yesterday', () => {
  const today = '2026-07-15';
  // grace: join day never counts
  assert.equal(computeMissStreak(null, '2026-07-15', today), 0); // joined today
  assert.equal(computeMissStreak(null, '2026-07-14', today), 0); // joined yesterday
  assert.equal(computeMissStreak(null, '2026-07-12', today), 2); // 13th+14th missed
  // prayer moves the anchor
  assert.equal(computeMissStreak('2026-07-14', '2026-07-01', today), 0);
  assert.equal(computeMissStreak('2026-07-12', '2026-07-01', today), 2);
  assert.equal(computeMissStreak('2026-07-09', '2026-07-01', today), 5);
  // rejoin: stale prayer_log rows older than the new join date cannot shorten grace
  assert.equal(computeMissStreak('2026-06-20', '2026-07-14', today), 0);
});

test('decideAction: warn once at >=2, remove at >=5 only 3+ days after warning', () => {
  const today = '2026-07-15';
  assert.equal(decideAction(0, null, today), 'none');
  assert.equal(decideAction(1, null, today), 'none');
  assert.equal(decideAction(2, null, today), 'warn');
  assert.equal(decideAction(2, '2026-07-14', today), 'none');   // already warned
  assert.equal(decideAction(5, null, today), 'warn');           // downtime: warn first, never remove unwarned
  assert.equal(decideAction(5, '2026-07-14', today), 'none');   // warning only 1 day old
  assert.equal(decideAction(5, '2026-07-12', today), 'remove'); // warned 3 days ago
  assert.equal(decideAction(7, '2026-07-10', today), 'remove');
});
