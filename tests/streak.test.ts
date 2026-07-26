import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { computeStreak, getStreakSummary, type StreakSummary } from '../src/streak.ts';
import { initDb, closeDb } from '../src/db/connection.ts';
import { upsertUser, insertRoom, addMember, insertTopic, recordPrayer } from '../src/db/repo.ts';
import { startHealthServer } from '../src/server.ts';
import { generateTestInitData } from '../src/auth.ts';
import config from '../src/config.ts';

test('computeStreak counts consecutive days back from today', () => {
  const today = '2026-07-15';

  // no history at all
  const empty = computeStreak([], today);
  assert.equal(empty.current, 0);
  assert.equal(empty.best, 0);
  assert.equal(empty.prayedToday, false);
  assert.equal(empty.lastPrayedDate, null);

  // prayed today + the two days before
  const live = computeStreak(['2026-07-13', '2026-07-14', '2026-07-15'], today);
  assert.equal(live.current, 3);
  assert.equal(live.best, 3);
  assert.equal(live.prayedToday, true);
  assert.equal(live.lastPrayedDate, '2026-07-15');

  // today not prayed yet: the streak stays alive through yesterday
  assert.equal(computeStreak(['2026-07-13', '2026-07-14'], today).current, 2);
  assert.equal(computeStreak(['2026-07-13', '2026-07-14'], today).prayedToday, false);

  // yesterday missed too: the streak is broken
  assert.equal(computeStreak(['2026-07-12', '2026-07-13'], today).current, 0);

  // duplicates and unsorted input collapse to distinct days
  assert.equal(computeStreak(['2026-07-15', '2026-07-14', '2026-07-15'], today).current, 2);
});

test('computeStreak best keeps the longest past run and week covers 7 days', () => {
  const today = '2026-07-15';
  const s = computeStreak(
    ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-14', '2026-07-15'],
    today,
  );
  assert.equal(s.current, 2);
  assert.equal(s.best, 4);

  assert.equal(s.week.length, 7);
  assert.equal(s.week[0].date, '2026-07-09');
  assert.equal(s.week[6].date, '2026-07-15');
  assert.deepEqual(s.week.map((d) => d.prayed), [false, false, false, false, false, true, true]);
});

test('getStreakSummary reads prayer_log across all rooms', () => {
  initDb(':memory:');
  upsertUser(1, 'Admin');
  upsertUser(2, 'Member');
  const roomA = insertRoom('Room A', 1, 'codestreak1');
  const roomB = insertRoom('Room B', 1, 'codestreak2');
  addMember(roomA, 2, 'member');
  addMember(roomB, 2, 'member');
  const topicA = insertTopic(roomA, 1, 'shared', 'Topic A');
  const topicB = insertTopic(roomB, 1, 'shared', 'Topic B');

  // two rooms on the same day count as one streak day
  recordPrayer(2, roomA, topicA, '2026-07-14');
  recordPrayer(2, roomB, topicB, '2026-07-14');
  recordPrayer(2, roomA, topicA, '2026-07-15');

  const s = getStreakSummary(2, '2026-07-15');
  assert.equal(s.current, 2);
  assert.equal(s.best, 2);
  assert.equal(s.prayedToday, true);
  assert.equal(s.lastPrayedDate, '2026-07-15');

  // another user's log is not mixed in
  assert.equal(getStreakSummary(1, '2026-07-15').current, 0);
  closeDb();
});

test('GET /api/me/streak returns the summary and /api/me embeds it', async () => {
  initDb(':memory:');
  const server = startHealthServer(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const initData = generateTestInitData({ id: 2001, first_name: 'Bob' }, config.telegramBotToken);
  const authHeaders = { Authorization: `Bearer ${initData}` };

  const streakRes = await fetch(`${baseUrl}/api/me/streak`, { headers: authHeaders });
  assert.equal(streakRes.status, 200);
  const streak = (await streakRes.json()) as StreakSummary;
  assert.equal(streak.current, 0);
  assert.equal(streak.week.length, 7);

  // create a room + topic and pray for it → streak becomes 1
  const roomRes = await fetch(`${baseUrl}/api/rooms`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Streak Room' }),
  });
  const room = (await roomRes.json()) as { id: number };
  const topicRes = await fetch(`${baseUrl}/api/rooms/${room.id}/topics`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'shared', text: 'Pray for the city' }),
  });
  const topic = (await topicRes.json()) as { id: number };
  const prayRes = await fetch(`${baseUrl}/api/topics/${topic.id}/pray`, { method: 'POST', headers: authHeaders });
  assert.equal(prayRes.status, 200);

  const meRes = await fetch(`${baseUrl}/api/me`, { headers: authHeaders });
  const me = (await meRes.json()) as { streak: StreakSummary };
  assert.equal(me.streak.current, 1);
  assert.equal(me.streak.prayedToday, true);
  assert.equal(me.streak.week[6].prayed, true);

  await new Promise<void>((r) => server.close(() => r()));
  closeDb();
});

test('/api/me/streak requires authentication', async () => {
  initDb(':memory:');
  const server = startHealthServer(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  const { port } = server.address() as AddressInfo;
  const res = await fetch(`http://127.0.0.1:${port}/api/me/streak`);
  assert.equal(res.status, 401);
  await new Promise<void>((r) => server.close(() => r()));
  closeDb();
});
