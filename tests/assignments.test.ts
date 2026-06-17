import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDate, localTime, dayNumber, sharedTopicOfDay, isReminderDue } from '../src/assignments.ts';
import type { Topic } from '../src/db/repo.ts';

const topic = (id: number, ownerId = 1): Topic => ({
  id, roomId: 1, ownerId, kind: 'shared', text: `t${id}`, status: 'active',
  answerNote: null, createdAt: '', answeredAt: null,
});

test('localDate/localTime format in the given timezone', () => {
  const now = new Date('2026-06-17T22:30:00Z'); // 00:30 next day in Europe/Podgorica (UTC+2 summer)
  assert.equal(localDate(now, 'Europe/Podgorica'), '2026-06-18');
  assert.equal(localTime(now, 'Europe/Podgorica'), '00:30');
});

test('dayNumber is a stable integer that increments by 1 per calendar day', () => {
  assert.equal(dayNumber('2026-06-18') - dayNumber('2026-06-17'), 1);
});

test('sharedTopicOfDay rotates in order and is null when none', () => {
  const shared = [topic(10), topic(11), topic(12)];
  assert.equal(sharedTopicOfDay(shared, 0)?.id, 10);
  assert.equal(sharedTopicOfDay(shared, 1)?.id, 11);
  assert.equal(sharedTopicOfDay(shared, 3)?.id, 10); // wraps
  assert.equal(sharedTopicOfDay([], 5), null);
});

test('isReminderDue matches the local HH:MM minute', () => {
  const now = new Date('2026-06-17T06:00:30Z'); // 08:00 in Europe/Podgorica (UTC+2)
  assert.equal(isReminderDue('08:00', now, 'Europe/Podgorica'), true);
  assert.equal(isReminderDue('08:01', now, 'Europe/Podgorica'), false);
});
