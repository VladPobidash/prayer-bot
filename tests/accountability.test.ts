import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMissStreak, decideAction, evaluateAccountability } from '../src/accountability.ts';
import { initDb, closeDb, getDb } from '../src/db/connection.ts';
import {
  upsertUser, insertRoom, addMember, getMember, insertTopic, listTopics,
  recordPrayer, upsertMembershipState, getMembershipState,
} from '../src/db/repo.ts';

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

// Room with admin 1 + member 2; member 2's join date backdated to `joined`.
function setupRoom(joined: string) {
  initDb(':memory:');
  upsertUser(1, 'Admin A'); upsertUser(2, 'Member B');
  const roomId = insertRoom('Room', 1, 'codeacct1');
  addMember(roomId, 1, 'admin'); addMember(roomId, 2, 'member');
  getDb().prepare(`UPDATE room_members SET joined_at = ? WHERE room_id = ? AND telegram_id = ?`)
    .run(`${joined} 10:00:00`, roomId, 2);
  return roomId;
}
function collector() {
  const sent: { chatId: number; text: string }[] = [];
  const notify = async (chatId: number, text: string) => { sent.push({ chatId, text }); };
  return { sent, notify };
}
const NOW = new Date('2026-07-15T12:00:00Z'); // today = 2026-07-15 in UTC

test('warns once at 2 missed days; admin exempt; second run same day is silent', async () => {
  const roomId = setupRoom('2026-07-01');
  const { sent, notify } = collector();
  await evaluateAccountability(NOW, 'UTC', notify);
  assert.equal(sent.length, 1);                       // only member 2, never admin 1
  assert.equal(sent[0].chatId, 2);
  assert.equal(getMembershipState(roomId, 2)?.warnedAt, '2026-07-15');
  await evaluateAccountability(NOW, 'UTC', notify);   // idempotent
  assert.equal(sent.length, 1);
  closeDb();
});

test('removes at 5 missed days when warned 3+ days ago: leave semantics + both DMs', async () => {
  const roomId = setupRoom('2026-07-01');
  insertTopic(roomId, 2, 'personal', 'my topic');
  const answered = insertTopic(roomId, 2, 'personal', 'answered one');
  getDb().prepare(`UPDATE topics SET status = 'answered' WHERE id = ?`).run(answered);
  upsertMembershipState(roomId, 2, null, 2, '2026-07-12'); // warned 3 days before NOW
  const { sent, notify } = collector();
  await evaluateAccountability(NOW, 'UTC', notify);
  assert.equal(getMember(roomId, 2), null);                          // membership gone
  const kinds = listTopics(roomId).filter((t) => t.ownerId === 2).map((t) => t.status);
  assert.deepEqual(kinds, ['answered']);                             // active personal deleted, answered kept
  assert.equal(getMembershipState(roomId, 2), null);                 // state row cleaned
  assert.deepEqual(sent.map((s) => s.chatId).sort(), [1, 2]);        // member + admin DM'd
  closeDb();
});

test('a prayer resets the streak and clears a stale warning', async () => {
  const roomId = setupRoom('2026-07-01');
  const topicId = insertTopic(roomId, 1, 'shared', 'church');
  upsertMembershipState(roomId, 2, null, 3, '2026-07-11');
  recordPrayer(2, roomId, topicId, '2026-07-14');       // prayed yesterday, after the warning
  const { sent, notify } = collector();
  await evaluateAccountability(NOW, 'UTC', notify);
  assert.equal(sent.length, 0);
  const st = getMembershipState(roomId, 2);
  assert.equal(st?.missStreak, 0);
  assert.equal(st?.warnedAt, null);
  closeDb();
});

test('new-member grace: joined yesterday, never prayed - no warning', async () => {
  setupRoom('2026-07-14');
  const { sent, notify } = collector();
  await evaluateAccountability(NOW, 'UTC', notify);
  assert.equal(sent.length, 0);
  closeDb();
});

test('catch-up after downtime: streak 7 with no prior warning warns instead of removing', async () => {
  const roomId = setupRoom('2026-07-07');
  const { sent, notify } = collector();
  await evaluateAccountability(NOW, 'UTC', notify);
  assert.equal(sent.length, 1);                        // warn, never silent-remove
  assert.equal(sent[0].chatId, 2);
  assert.equal(getMembershipState(roomId, 2)?.warnedAt, '2026-07-15');
  closeDb();
});

test('a failing DM does not block the rest of the sweep', async () => {
  const roomId = setupRoom('2026-07-01');
  upsertUser(3, 'Member C');
  addMember(roomId, 3, 'member');
  getDb().prepare(`UPDATE room_members SET joined_at = ? WHERE room_id = ? AND telegram_id = ?`)
    .run('2026-07-01 10:00:00', roomId, 3);
  const sent: number[] = [];
  const notify = async (chatId: number) => {
    if (chatId === 2) throw new Error('blocked bot');
    sent.push(chatId);
  };
  await evaluateAccountability(NOW, 'UTC', notify);
  assert.deepEqual(sent, [3]);                         // member 3 still warned
  closeDb();
});
