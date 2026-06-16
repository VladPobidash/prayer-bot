import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, closeDb } from '../src/db/connection.ts';
import {
  upsertUser, insertRoom, getRoom, getRoomByInvite, setRoomStatus,
  addMember, countRoomsForUser, listRoomsForUser,
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
