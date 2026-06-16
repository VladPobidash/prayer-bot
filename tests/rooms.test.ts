import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, closeDb } from '../src/db/connection.ts';
import { upsertUser } from '../src/db/repo.ts';
import { createRoom, joinRoom, generateInviteCode } from '../src/rooms.ts';

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
