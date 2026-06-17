import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDate, localTime, dayNumber, sharedTopicOfDay, isReminderDue, assignPersonalTopics } from '../src/assignments.ts';
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

const p = (id: number, ownerId: number) => ({ id, ownerId });

test('assignPersonalTopics: never self, one per member, covers all within a cycle', () => {
  const members = [1, 2, 3];
  const topics = [p(10, 1), p(11, 2), p(12, 3)]; // each member owns one
  const coveredAcrossCycle = new Set<number>();
  for (let day = 0; day < 3; day++) {
    const map = assignPersonalTopics(members, topics, day);
    for (const member of members) {
      const tid = map.get(member);
      assert.notEqual(tid, null);                       // everyone gets one
      const owner = topics.find((t) => t.id === tid)!.ownerId;
      assert.notEqual(owner, member);                   // never your own
      if (tid != null) coveredAcrossCycle.add(tid);
    }
  }
  assert.deepEqual([...coveredAcrossCycle].sort((a, b) => a - b), [10, 11, 12]); // all covered over the cycle
});

test('assignPersonalTopics edge cases', () => {
  assert.equal(assignPersonalTopics([1], [], 0).get(1), null);              // no topics → null
  assert.equal(assignPersonalTopics([1], [p(10, 1)], 0).get(1), null);     // only own topic → null
  // member with no own topic still gets assigned someone else's
  assert.equal(assignPersonalTopics([1, 2], [p(11, 2)], 0).get(1), 11);
  assert.equal(assignPersonalTopics([1, 2], [p(11, 2)], 0).get(2), null);  // owner 2 can't get own
});
