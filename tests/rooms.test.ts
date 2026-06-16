import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, closeDb } from '../src/db/connection.ts';
import { upsertUser } from '../src/db/repo.ts';
import { createRoom, joinRoom, generateInviteCode, leaveRoom, closeRoom, addSharedTopic, addPersonalTopic, postUpdate, markAnswered, isRoomAdmin, isRoomMember } from '../src/rooms.ts';
import { listTopics, getMember, getRoom, getTopic, listTopicUpdates } from '../src/db/repo.ts';

test('generateInviteCode returns an 8-char url-safe unique code', () => {
  initDb(':memory:');
  const code = generateInviteCode();
  assert.match(code, /^[A-Za-z0-9_-]{8}$/);
  closeDb();
});

test('createRoom enforces the 3-room cap and makes the creator admin', () => {
  initDb(':memory:');
  upsertUser(1, 'Admin');
  for (let i = 1; i <= 3; i++) {
    const res = createRoom(1, `Room ${i}`);
    assert.equal(res.ok, true);
  }
  const fourth = createRoom(1, 'Room 4');
  assert.equal(fourth.ok, false);
  assert.equal(fourth.ok === false && fourth.error, 'room_cap');
  closeDb();
});

test('joinRoom: valid code adds member; rejects duplicate, unknown, and over-cap', () => {
  initDb(':memory:');
  upsertUser(1, 'Admin'); upsertUser(2, 'Bob');
  const created = createRoom(1, 'Room');
  assert.equal(created.ok, true);
  const code = created.ok === true ? created.value.inviteCode : '';

  const join = joinRoom(2, code);
  assert.equal(join.ok, true);
  const dupJoin = joinRoom(2, code);
  assert.equal(dupJoin.ok === false && dupJoin.error, 'already_member');
  const badJoin = joinRoom(2, 'badcode0');
  assert.equal(badJoin.ok === false && badJoin.error, 'invite_invalid');
  closeDb();
});

test('addSharedTopic: admin only, max 5; addPersonalTopic: member, max 3', () => {
  initDb(':memory:');
  upsertUser(1, 'Admin'); upsertUser(2, 'Bob');
  const room = createRoom(1, 'Room');
  const roomId = room.ok === true ? room.value.id : 0;
  joinRoom(2, room.ok === true ? room.value.inviteCode : '');

  for (let i = 1; i <= 5; i++) assert.equal(addSharedTopic(1, roomId, `shared ${i}`).ok, true);
  const sharedCap = addSharedTopic(1, roomId, 'shared 6');
  assert.equal(sharedCap.ok === false && sharedCap.error, 'shared_cap');
  const notAdmin = addSharedTopic(2, roomId, 'not admin');
  assert.equal(notAdmin.ok === false && notAdmin.error, 'not_admin');

  for (let i = 1; i <= 3; i++) assert.equal(addPersonalTopic(2, roomId, `mine ${i}`).ok, true);
  const personalCap = addPersonalTopic(2, roomId, 'mine 4');
  assert.equal(personalCap.ok === false && personalCap.error, 'personal_cap');
  closeDb();
});

test('leaveRoom: member leaves and their active personal topics are removed; admin cannot leave', () => {
  initDb(':memory:');
  upsertUser(1, 'Admin'); upsertUser(2, 'Bob');
  const room = createRoom(1, 'Room');
  const roomId = room.ok === true ? room.value.id : 0;
  joinRoom(2, room.ok === true ? room.value.inviteCode : '');
  addPersonalTopic(2, roomId, 'mine');

  const adminLeave = leaveRoom(1, roomId);
  assert.equal(adminLeave.ok === false && adminLeave.error, 'not_member'); // admin can't leave
  assert.equal(leaveRoom(2, roomId).ok, true);
  assert.equal(getMember(roomId, 2), null);
  assert.equal(listTopics(roomId).filter((t) => t.ownerId === 2 && t.status === 'active').length, 0);
  closeDb();
});

test('closeRoom: admin only; sets status closed', () => {
  initDb(':memory:');
  upsertUser(1, 'Admin'); upsertUser(2, 'Bob');
  const room = createRoom(1, 'Room');
  const roomId = room.ok === true ? room.value.id : 0;
  joinRoom(2, room.ok === true ? room.value.inviteCode : '');
  const notAdminClose = closeRoom(2, roomId);
  assert.equal(notAdminClose.ok === false && notAdminClose.error, 'not_admin');
  assert.equal(closeRoom(1, roomId).ok, true);
  assert.equal(getRoom(roomId)?.status, 'closed');
  closeDb();
});

test('postUpdate + markAnswered: owner only', () => {
  initDb(':memory:');
  upsertUser(1, 'Admin'); upsertUser(2, 'Bob');
  const room = createRoom(1, 'Room');
  const roomId = room.ok === true ? room.value.id : 0;
  joinRoom(2, room.ok === true ? room.value.inviteCode : '');
  const topic = addPersonalTopic(2, roomId, 'mine');
  const topicId = topic.ok === true ? topic.value.id : 0;

  const notOwner = postUpdate(1, topicId, 'not owner');
  assert.equal(notOwner.ok === false && notOwner.error, 'not_owner');
  assert.equal(postUpdate(2, topicId, 'progress').ok, true);
  assert.equal(listTopicUpdates(topicId).length, 1);

  assert.equal(markAnswered(2, topicId, 'God answered!').ok, true);
  assert.equal(getTopic(topicId)?.status, 'answered');
});

test('auth helpers', () => {
  // continues on the same in-memory db from the previous test
  const room = createRoom(1, 'Auth Room');
  const roomId = room.ok === true ? room.value.id : 0;
  joinRoom(2, room.ok === true ? room.value.inviteCode : '');
  assert.equal(isRoomAdmin(1, roomId), true);
  assert.equal(isRoomAdmin(2, roomId), false);
  assert.equal(isRoomMember(2, roomId), true);
  assert.equal(isRoomMember(999, roomId), false);
  closeDb();
});

test('joinRoom rejects when the joiner is already at the room cap', () => {
  initDb(':memory:');
  upsertUser(2, 'Bob');
  // Use 4 separate admins so each can create one room (cap is per-user).
  const codes: string[] = [];
  for (let i = 10; i <= 13; i++) {
    upsertUser(i, `Admin${i}`);
    const r = createRoom(i, `Room ${i}`);
    if (r.ok) codes.push(r.value.inviteCode);
  }
  // Bob joins 3 rooms — now at the cap of 3.
  for (let i = 0; i < 3; i++) assert.equal(joinRoom(2, codes[i]).ok, true);
  // The 4th join must be rejected by the room cap.
  const over = joinRoom(2, codes[3]);
  assert.equal(over.ok, false);
  assert.equal(over.ok === false && over.error, 'room_cap');
  closeDb();
});
