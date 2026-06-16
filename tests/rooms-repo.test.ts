import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, closeDb } from '../src/db/connection.ts';
import {
  upsertUser, insertRoom, getRoom, getRoomByInvite, setRoomStatus,
  addMember, countRoomsForUser, listRoomsForUser,
  removeMember, getMember, listMembers, countMembers,
  insertTopic, getTopic, listTopics, countActiveTopics,
  setTopicAnswered, deleteActivePersonalTopics, insertTopicUpdate, listTopicUpdates,
} from '../src/db/repo.ts';

test('initDb creates the prayer-room tables', () => {
  const db = initDb(':memory:');
  const names = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r) => (r as { name: string }).name);
  for (const t of ['users', 'rooms', 'room_members', 'topics', 'topic_updates']) {
    assert.ok(names.includes(t), `missing table: ${t}`);
  }
  closeDb();
});

test('rooms: insert/get/getByInvite and membership-based room counts', () => {
  initDb(':memory:');
  upsertUser(1, 'Admin');
  const roomId = insertRoom('Morning Prayer', 1, 'abc123xy');
  addMember(roomId, 1, 'admin');

  const room = getRoom(roomId);
  assert.equal(room?.name, 'Morning Prayer');
  assert.equal(room?.adminId, 1);
  assert.equal(room?.status, 'active');
  assert.equal(getRoomByInvite('abc123xy')?.id, roomId);
  assert.equal(getRoomByInvite('nope'), null);

  assert.equal(countRoomsForUser(1), 1);
  assert.equal(listRoomsForUser(1)[0].role, 'admin');

  setRoomStatus(roomId, 'closed');
  assert.equal(getRoom(roomId)?.status, 'closed');
  closeDb();
});

test('members: add/get/list/count/remove', () => {
  initDb(':memory:');
  const roomId = insertRoom('Room', 1, 'codeaaaa');
  addMember(roomId, 1, 'admin');
  addMember(roomId, 2, 'member');

  assert.equal(countMembers(roomId), 2);
  assert.equal(getMember(roomId, 2)?.role, 'member');
  assert.deepEqual(listMembers(roomId).map((m) => m.telegramId).sort(), [1, 2]);

  removeMember(roomId, 2);
  assert.equal(getMember(roomId, 2), null);
  assert.equal(countMembers(roomId), 1);
  closeDb();
});

test('topics: insert/list/count(active)/answer/delete + updates', () => {
  initDb(':memory:');
  const roomId = insertRoom('Room', 1, 'codebbbb');
  const t1 = insertTopic(roomId, 1, 'shared', 'For the church');
  const t2 = insertTopic(roomId, 2, 'personal', 'My exam');

  assert.equal(countActiveTopics(roomId, 'shared'), 1);
  assert.equal(countActiveTopics(roomId, 'personal', 2), 1);
  assert.equal(listTopics(roomId).length, 2);

  insertTopicUpdate(t2, 2, 'still studying');
  assert.equal(listTopicUpdates(t2).length, 1);

  setTopicAnswered(t1, 'God provided');
  assert.equal(getTopic(t1)?.status, 'answered');
  assert.equal(getTopic(t1)?.answerNote, 'God provided');
  assert.equal(countActiveTopics(roomId, 'shared'), 0); // answered frees the slot

  deleteActivePersonalTopics(roomId, 2);
  assert.equal(countActiveTopics(roomId, 'personal', 2), 0);
  closeDb();
});
