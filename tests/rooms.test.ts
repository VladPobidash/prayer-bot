import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, closeDb } from '../src/db/connection.ts';
import { upsertUser } from '../src/db/repo.ts';
import { createRoom, joinRoom, generateInviteCode, leaveRoom, closeRoom, addSharedTopic, addPersonalTopic } from '../src/rooms.ts';
import { listTopics, getMember, getRoom } from '../src/db/repo.ts';

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
