import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, closeDb } from '../src/db/connection.ts';
import { upsertUser, insertRoom, addMember, insertTopic, setReminderTime, setUserTimezone, hasSentToday, recordPrayer } from '../src/db/repo.ts';
import { dispatchDueReminders } from '../src/reminders.ts';

function setup() {
  initDb(':memory:');
  upsertUser(1, 'A'); upsertUser(2, 'B');
  setUserTimezone(1, 'Europe/Podgorica'); setUserTimezone(2, 'Europe/Podgorica');
  const roomId = insertRoom('Room', 1, 'coderem1');
  addMember(roomId, 1, 'admin'); addMember(roomId, 2, 'member');
  insertTopic(roomId, 1, 'shared', 'church');
  insertTopic(roomId, 2, 'personal', 'exam'); // B's
  insertTopic(roomId, 1, 'personal', 'work');  // A's
  return roomId;
}

test('dispatchDueReminders sends per-topic messages to due users and is idempotent', async () => {
  setup();
  setReminderTime(1, '08:00');
  const sent: { chatId: number; text: string; topicId: number | null }[] = [];
  let mid = 1000;
  const send = async (chatId: number, text: string, topicId: number | null) => { sent.push({ chatId, text, topicId }); return ++mid; };
  const now = new Date('2026-06-17T06:00:30Z'); // 08:00 Europe/Podgorica (UTC+2 summer)

  await dispatchDueReminders(now, send);
  // user 1 is due: gets shared + one personal (B's, since not own) = 2 messages; user 2 has no reminder time → 0
  assert.equal(sent.filter((s) => s.chatId === 1).length, 2);
  assert.equal(sent.filter((s) => s.chatId === 2).length, 0);
  assert.equal(hasSentToday(1, '2026-06-17'), true);

  const before = sent.length;
  await dispatchDueReminders(now, send); // same day, already sent → no re-send
  assert.equal(sent.length, before);
  closeDb();
});

test('the streak line rides on the first reminder message only', async () => {
  const roomId = setup();
  setReminderTime(1, '08:00');
  // user 1 prayed on the two days before 2026-06-17 → a live 2-day streak
  recordPrayer(1, roomId, 1, '2026-06-15');
  recordPrayer(1, roomId, 1, '2026-06-16');
  const sent: string[] = [];
  let mid = 3000;
  const send = async (_chatId: number, text: string) => { sent.push(text); return ++mid; };

  await dispatchDueReminders(new Date('2026-06-17T06:00:30Z'), send);

  assert.equal(sent.length, 2);
  assert.match(sent[0], /🔥 Ваша серія: 2 дн/);
  assert.doesNotMatch(sent[1], /🔥/);
  closeDb();
});

test('a user with no streak yet gets the start-your-streak line', async () => {
  setup();
  setReminderTime(1, '08:00');
  const sent: string[] = [];
  const send = async (_chatId: number, text: string) => { sent.push(text); return 4000; };

  await dispatchDueReminders(new Date('2026-06-17T06:00:30Z'), send);

  assert.match(sent[0], /щоб почати свою серію/i);
  closeDb();
});

test('dispatchDueReminders skips users whose local time is before their reminder', async () => {
  setup();
  setReminderTime(1, '23:00');
  const sent: number[] = [];
  const send = async () => { sent.push(1); return 1; };
  await dispatchDueReminders(new Date('2026-06-17T06:00:30Z'), send); // 08:00 < 23:00
  assert.equal(sent.length, 0);
  closeDb();
});

test('dispatchDueReminders sends a daily nudge when a member has no eligible topic', async () => {
  initDb(':memory:');
  upsertUser(1, 'A'); upsertUser(2, 'B');
  setUserTimezone(1, 'Europe/Podgorica'); setUserTimezone(2, 'Europe/Podgorica');
  const roomId = insertRoom('Empty room', 1, 'coderem2');
  addMember(roomId, 1, 'admin'); addMember(roomId, 2, 'member');
  // B only owns a personal topic, which is never assigned back to B.
  insertTopic(roomId, 2, 'personal', 'my private topic');
  setReminderTime(2, '08:00');
  const sent: { chatId: number; text: string; topicId: number | null }[] = [];
  const send = async (chatId: number, text: string, topicId: number | null) => {
    sent.push({ chatId, text, topicId });
    return 2000;
  };
  const now = new Date('2026-06-17T06:00:30Z');

  await dispatchDueReminders(now, send);

  assert.equal(sent.length, 1);
  assert.equal(sent[0].chatId, 2);
  assert.equal(sent[0].topicId, null);
  assert.match(sent[0].text, /немає призначеної теми/i);
  assert.equal(hasSentToday(2, '2026-06-17'), true);
  closeDb();
});
