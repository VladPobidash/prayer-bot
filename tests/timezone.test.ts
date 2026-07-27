import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, closeDb } from '../src/db/connection.ts';
import { upsertUser, insertRoom, addMember, insertTopic, setReminderTime, setUserTimezone, hasSentToday } from '../src/db/repo.ts';
import { isValidTimezone, userTimezone, userToday } from '../src/timezone.ts';
import { dispatchDueReminders } from '../src/reminders.ts';

test('isValidTimezone accepts IANA zones and rejects junk', () => {
  assert.equal(isValidTimezone('Europe/Kyiv'), true);
  assert.equal(isValidTimezone('America/New_York'), true);
  assert.equal(isValidTimezone('UTC'), true);
  assert.equal(isValidTimezone('Middle/Earth'), false);
  assert.equal(isValidTimezone(''), false);
});

test('an unknown or invalid zone falls back to UTC', () => {
  initDb(':memory:');
  upsertUser(1, 'No zone yet');
  assert.equal(userTimezone(1), 'UTC');

  upsertUser(2, 'Broken zone');
  setUserTimezone(2, 'Middle/Earth');
  assert.equal(userTimezone(2), 'UTC');
  closeDb();
});

test('today is resolved in the user\'s own zone, not the server\'s', () => {
  initDb(':memory:');
  upsertUser(1, 'Kyiv'); setUserTimezone(1, 'Europe/Kyiv');
  upsertUser(2, 'Los Angeles'); setUserTimezone(2, 'America/Los_Angeles');

  // 2026-07-15 22:30 UTC: already the 16th in Kyiv, still the 15th in LA.
  const now = new Date('2026-07-15T22:30:00Z');
  assert.equal(userToday(1, now), '2026-07-16');
  assert.equal(userToday(2, now), '2026-07-15');
  closeDb();
});

test('reminders fire on each user\'s own clock', async () => {
  initDb(':memory:');
  upsertUser(1, 'Kyiv'); setUserTimezone(1, 'Europe/Kyiv');
  upsertUser(2, 'Los Angeles'); setUserTimezone(2, 'America/Los_Angeles');
  const roomId = insertRoom('Room', 1, 'codetz01');
  addMember(roomId, 1, 'admin'); addMember(roomId, 2, 'member');
  insertTopic(roomId, 1, 'shared', 'peace');
  setReminderTime(1, '08:00');
  setReminderTime(2, '08:00');

  const sent: number[] = [];
  let mid = 500;
  const send = async (chatId: number) => { sent.push(chatId); return ++mid; };

  // 05:10 UTC is 08:10 on the 15th in Kyiv, but 22:10 on the *14th* in LA — so
  // each user is served for their own calendar day, not the server's.
  await dispatchDueReminders(new Date('2026-07-15T05:10:00Z'), send);
  assert.equal(hasSentToday(1, '2026-07-15'), true);
  assert.equal(hasSentToday(2, '2026-07-14'), true);
  assert.equal(hasSentToday(2, '2026-07-15'), false);

  // 15:10 UTC is 08:10 on the 15th in LA: their next day comes due on its own.
  await dispatchDueReminders(new Date('2026-07-15T15:10:00Z'), send);
  assert.equal(hasSentToday(2, '2026-07-15'), true);
  // Kyiv is already past midnight into the 16th and must not be re-sent for it
  // before 08:00 local.
  assert.equal(hasSentToday(1, '2026-07-16'), false);
  closeDb();
});
