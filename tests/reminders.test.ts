import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, closeDb } from '../src/db/connection.ts';
import { upsertUser, insertRoom, addMember, insertTopic, setReminderTime, hasSentToday } from '../src/db/repo.ts';
import { dispatchDueReminders } from '../src/reminders.ts';

function setup() {
  initDb(':memory:');
  upsertUser(1, 'A'); upsertUser(2, 'B');
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
  const sent: { chatId: number; text: string; topicId: number }[] = [];
  let mid = 1000;
  const send = async (chatId: number, text: string, topicId: number) => { sent.push({ chatId, text, topicId }); return ++mid; };
  const now = new Date('2026-06-17T06:00:30Z'); // 08:00 Europe/Podgorica (UTC+2 summer)

  await dispatchDueReminders(now, 'Europe/Podgorica', send);
  // user 1 is due: gets shared + one personal (B's, since not own) = 2 messages; user 2 has no reminder time → 0
  assert.equal(sent.filter((s) => s.chatId === 1).length, 2);
  assert.equal(sent.filter((s) => s.chatId === 2).length, 0);
  assert.equal(hasSentToday(1, '2026-06-17'), true);

  const before = sent.length;
  await dispatchDueReminders(now, 'Europe/Podgorica', send); // same day, already sent → no re-send
  assert.equal(sent.length, before);
  closeDb();
});

test('dispatchDueReminders skips users whose local time is before their reminder', async () => {
  setup();
  setReminderTime(1, '23:00');
  const sent: number[] = [];
  const send = async () => { sent.push(1); return 1; };
  await dispatchDueReminders(new Date('2026-06-17T06:00:30Z'), 'Europe/Podgorica', send); // 08:00 < 23:00
  assert.equal(sent.length, 0);
  closeDb();
});
