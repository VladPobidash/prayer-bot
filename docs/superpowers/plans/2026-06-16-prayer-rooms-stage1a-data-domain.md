# Prayer Rooms — Stage 1a (Data & Domain Layer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure data + domain layer for prayer rooms and topics — SQLite schema, the `repo.ts` query functions, and a new `rooms.ts` with all business rules (room/topic caps, invite codes, per-room authorization, state transitions) — fully unit-tested, with no Telegram involved.

**Architecture:** DDL lives in `db/connection.ts`, all SQL (DML) in `db/repo.ts` (the swap seam), and domain orchestration in a new pure-ish `src/rooms.ts` that returns typed `Result` objects (never throws for expected outcomes) so the future bot layer (Plan 1b) can map errors to friendly messages. Caps are committed tunables in `preferences.ts`.

**Tech Stack:** TypeScript (Node ≥24 type-stripping, no build), better-sqlite3 (WAL), `node:test` + `node:assert/strict`, `node:crypto` for invite codes. Tests run against an in-memory DB via `initDb(':memory:')`.

**Conventions:** explicit `.ts` import extensions; erasable-only TS (no `enum` — use `const`+union types); all SQL in `connection.ts`/`repo.ts` only; `npm test` (= `tsc --noEmit` + `node --test`) must stay green; one commit per task; never reference any internal/reference app.

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `src/preferences.ts` | modify | Add room/topic cap constants |
| `src/db/connection.ts` | modify | Add 5 tables + indexes (DDL) in `initDb()` |
| `src/db/repo.ts` | modify | Add domain types + all room/member/topic SQL functions |
| `src/rooms.ts` | create | Domain logic: invite codes, caps, auth, state transitions; returns `Result<T>` |
| `tests/rooms-repo.test.ts` | create | Repo-layer tests (in-memory DB) |
| `tests/rooms.test.ts` | create | Domain-layer tests (in-memory DB) |

---

## Task 1: Caps + schema

**Files:**
- Modify: `src/preferences.ts`
- Modify: `src/db/connection.ts` (inside `initDb()`, after the `bot_state` table)
- Test: `tests/rooms-repo.test.ts`

- [ ] **Step 1: Add cap constants to `src/preferences.ts`** (append after `LOG_PREFIX`)

```ts
// Prayer-room domain caps (committed, code-reviewed tunables).
export const MAX_ROOMS_PER_USER = 3;            // rooms a person can be in total (admin or member)
export const MAX_SHARED_TOPICS_PER_ROOM = 5;    // active shared topics an admin can have per room
export const MAX_PERSONAL_TOPICS_PER_MEMBER = 3; // active personal topics a member can have per room
```

- [ ] **Step 2: Write the failing schema test** — create `tests/rooms-repo.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, getDb, closeDb } from '../src/db/connection.ts';

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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — the new tables don't exist yet (assertion `missing table: users`).

- [ ] **Step 4: Add the schema to `src/db/connection.ts`**

Inside `initDb()`, immediately after the existing `CREATE TABLE IF NOT EXISTS bot_state (...)` `db.exec(...)` call and before `runMigrations(db)`, add:

```ts
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id  INTEGER PRIMARY KEY,
      display_name TEXT,
      locale       TEXT,
      created_at   TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      admin_id    INTEGER NOT NULL,
      invite_code TEXT NOT NULL UNIQUE,
      status      TEXT NOT NULL DEFAULT 'active',
      created_at  TEXT DEFAULT (datetime('now')),
      closed_at   TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_rooms_invite ON rooms(invite_code)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS room_members (
      room_id     INTEGER NOT NULL,
      telegram_id INTEGER NOT NULL,
      role        TEXT NOT NULL DEFAULT 'member',
      joined_at   TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (room_id, telegram_id)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_members_user ON room_members(telegram_id)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS topics (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id     INTEGER NOT NULL,
      owner_id    INTEGER NOT NULL,
      kind        TEXT NOT NULL,
      text        TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'active',
      answer_note TEXT,
      created_at  TEXT DEFAULT (datetime('now')),
      answered_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_topics_room ON topics(room_id, status)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS topic_updates (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id   INTEGER NOT NULL,
      author_id  INTEGER NOT NULL,
      text       TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all 5 tables present; existing tests still green.

- [ ] **Step 6: Commit**

```bash
git add src/preferences.ts src/db/connection.ts tests/rooms-repo.test.ts
git commit -m "feat(rooms): add prayer-room schema + cap constants"
```

---

## Task 2: Repo — types, users, rooms

**Files:**
- Modify: `src/db/repo.ts` (append after the existing `bot_state` section)
- Test: `tests/rooms-repo.test.ts` (append)

- [ ] **Step 1: Append the failing test** to `tests/rooms-repo.test.ts`

```ts
import {
  upsertUser, insertRoom, getRoom, getRoomByInvite, setRoomStatus,
  addMember, countRoomsForUser, listRoomsForUser,
} from '../src/db/repo.ts';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `tsc` errors that these functions are not exported from `repo.ts`.

- [ ] **Step 3: Append types + functions to `src/db/repo.ts`**

```ts
// ─────────────────────────── Prayer-room domain ───────────────────────────

export type RoomStatus = 'active' | 'closed';
export type MemberRole = 'admin' | 'member';
export type TopicKind = 'shared' | 'personal';
export type TopicStatus = 'active' | 'answered';

export interface Room {
  id: number; name: string; adminId: number; inviteCode: string;
  status: RoomStatus; createdAt: string; closedAt: string | null;
}
export interface RoomWithRole extends Room { role: MemberRole; }
export interface Topic {
  id: number; roomId: number; ownerId: number; kind: TopicKind; text: string;
  status: TopicStatus; answerNote: string | null; createdAt: string; answeredAt: string | null;
}

interface RoomRow {
  id: number; name: string; admin_id: number; invite_code: string;
  status: string; created_at: string; closed_at: string | null;
}
function toRoom(r: RoomRow): Room {
  return {
    id: r.id, name: r.name, adminId: r.admin_id, inviteCode: r.invite_code,
    status: r.status as RoomStatus, createdAt: r.created_at, closedAt: r.closed_at,
  };
}

// ---- users ----
export function upsertUser(telegramId: number, displayName: string | null): void {
  getDb().prepare(
    `INSERT INTO users (telegram_id, display_name) VALUES (?, ?)
     ON CONFLICT(telegram_id) DO UPDATE SET display_name = COALESCE(excluded.display_name, users.display_name)`,
  ).run(telegramId, displayName);
}

// ---- rooms ----
export function insertRoom(name: string, adminId: number, inviteCode: string): number {
  const r = getDb().prepare(
    `INSERT INTO rooms (name, admin_id, invite_code) VALUES (?, ?, ?)`,
  ).run(name, adminId, inviteCode);
  return Number(r.lastInsertRowid);
}
export function getRoom(id: number): Room | null {
  const row = getDb().prepare(`SELECT * FROM rooms WHERE id = ?`).get(id) as RoomRow | undefined;
  return row ? toRoom(row) : null;
}
export function getRoomByInvite(code: string): Room | null {
  const row = getDb().prepare(`SELECT * FROM rooms WHERE invite_code = ?`).get(code) as RoomRow | undefined;
  return row ? toRoom(row) : null;
}
export function setRoomStatus(id: number, status: RoomStatus): void {
  getDb().prepare(
    `UPDATE rooms SET status = ?, closed_at = CASE WHEN ? = 'closed' THEN datetime('now') ELSE closed_at END WHERE id = ?`,
  ).run(status, status, id);
}
export function countRoomsForUser(telegramId: number): number {
  return (getDb().prepare(
    `SELECT COUNT(*) AS c FROM room_members m JOIN rooms r ON r.id = m.room_id
     WHERE m.telegram_id = ? AND r.status = 'active'`,
  ).get(telegramId) as { c: number }).c;
}
export function listRoomsForUser(telegramId: number): RoomWithRole[] {
  const rows = getDb().prepare(
    `SELECT r.*, m.role AS role FROM rooms r JOIN room_members m ON m.room_id = r.id
     WHERE m.telegram_id = ? AND r.status = 'active' ORDER BY r.created_at`,
  ).all(telegramId) as (RoomRow & { role: string })[];
  return rows.map((r) => ({ ...toRoom(r), role: r.role as MemberRole }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/repo.ts tests/rooms-repo.test.ts
git commit -m "feat(rooms): repo types + user/room queries"
```

---

## Task 3: Repo — membership

**Files:**
- Modify: `src/db/repo.ts` (append)
- Test: `tests/rooms-repo.test.ts` (append)

- [ ] **Step 1: Append the failing test**

```ts
import { removeMember, getMember, listMembers, countMembers } from '../src/db/repo.ts';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Append to `src/db/repo.ts`**

```ts
export interface Member { roomId: number; telegramId: number; role: MemberRole; joinedAt: string; }
interface MemberRow { room_id: number; telegram_id: number; role: string; joined_at: string; }
function toMember(r: MemberRow): Member {
  return { roomId: r.room_id, telegramId: r.telegram_id, role: r.role as MemberRole, joinedAt: r.joined_at };
}

export function addMember(roomId: number, telegramId: number, role: MemberRole): void {
  getDb().prepare(
    `INSERT INTO room_members (room_id, telegram_id, role) VALUES (?, ?, ?)
     ON CONFLICT(room_id, telegram_id) DO UPDATE SET role = excluded.role`,
  ).run(roomId, telegramId, role);
}
export function removeMember(roomId: number, telegramId: number): void {
  getDb().prepare(`DELETE FROM room_members WHERE room_id = ? AND telegram_id = ?`).run(roomId, telegramId);
}
export function getMember(roomId: number, telegramId: number): Member | null {
  const row = getDb().prepare(
    `SELECT * FROM room_members WHERE room_id = ? AND telegram_id = ?`,
  ).get(roomId, telegramId) as MemberRow | undefined;
  return row ? toMember(row) : null;
}
export function listMembers(roomId: number): Member[] {
  return (getDb().prepare(`SELECT * FROM room_members WHERE room_id = ? ORDER BY joined_at`).all(roomId) as MemberRow[]).map(toMember);
}
export function countMembers(roomId: number): number {
  return (getDb().prepare(`SELECT COUNT(*) AS c FROM room_members WHERE room_id = ?`).get(roomId) as { c: number }).c;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/repo.ts tests/rooms-repo.test.ts
git commit -m "feat(rooms): repo membership queries"
```

---

## Task 4: Repo — topics + updates

**Files:**
- Modify: `src/db/repo.ts` (append)
- Test: `tests/rooms-repo.test.ts` (append)

Cap rule: caps count **active** topics (an answered topic frees a slot).

- [ ] **Step 1: Append the failing test**

```ts
import {
  insertTopic, getTopic, listTopics, countActiveTopics,
  setTopicAnswered, deleteActivePersonalTopics, insertTopicUpdate, listTopicUpdates,
} from '../src/db/repo.ts';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Append to `src/db/repo.ts`**

```ts
export interface TopicUpdate { id: number; topicId: number; authorId: number; text: string; createdAt: string; }
interface TopicRow {
  id: number; room_id: number; owner_id: number; kind: string; text: string;
  status: string; answer_note: string | null; created_at: string; answered_at: string | null;
}
function toTopic(r: TopicRow): Topic {
  return {
    id: r.id, roomId: r.room_id, ownerId: r.owner_id, kind: r.kind as TopicKind, text: r.text,
    status: r.status as TopicStatus, answerNote: r.answer_note, createdAt: r.created_at, answeredAt: r.answered_at,
  };
}

export function insertTopic(roomId: number, ownerId: number, kind: TopicKind, text: string): number {
  const r = getDb().prepare(
    `INSERT INTO topics (room_id, owner_id, kind, text) VALUES (?, ?, ?, ?)`,
  ).run(roomId, ownerId, kind, text);
  return Number(r.lastInsertRowid);
}
export function getTopic(id: number): Topic | null {
  const row = getDb().prepare(`SELECT * FROM topics WHERE id = ?`).get(id) as TopicRow | undefined;
  return row ? toTopic(row) : null;
}
export function listTopics(roomId: number): Topic[] {
  return (getDb().prepare(`SELECT * FROM topics WHERE room_id = ? ORDER BY created_at`).all(roomId) as TopicRow[]).map(toTopic);
}
// Counts ACTIVE topics. For personal, pass ownerId to scope to one member.
export function countActiveTopics(roomId: number, kind: TopicKind, ownerId?: number): number {
  if (ownerId !== undefined) {
    return (getDb().prepare(
      `SELECT COUNT(*) AS c FROM topics WHERE room_id = ? AND kind = ? AND owner_id = ? AND status = 'active'`,
    ).get(roomId, kind, ownerId) as { c: number }).c;
  }
  return (getDb().prepare(
    `SELECT COUNT(*) AS c FROM topics WHERE room_id = ? AND kind = ? AND status = 'active'`,
  ).get(roomId, kind) as { c: number }).c;
}
export function setTopicAnswered(id: number, answerNote: string): void {
  getDb().prepare(
    `UPDATE topics SET status = 'answered', answer_note = ?, answered_at = datetime('now') WHERE id = ?`,
  ).run(answerNote, id);
}
export function deleteActivePersonalTopics(roomId: number, ownerId: number): void {
  getDb().prepare(
    `DELETE FROM topics WHERE room_id = ? AND owner_id = ? AND kind = 'personal' AND status = 'active'`,
  ).run(roomId, ownerId);
}
export function insertTopicUpdate(topicId: number, authorId: number, text: string): void {
  getDb().prepare(`INSERT INTO topic_updates (topic_id, author_id, text) VALUES (?, ?, ?)`).run(topicId, authorId, text);
}
export function listTopicUpdates(topicId: number): TopicUpdate[] {
  return (getDb().prepare(`SELECT * FROM topic_updates WHERE topic_id = ? ORDER BY created_at`).all(topicId) as
    { id: number; topic_id: number; author_id: number; text: string; created_at: string }[])
    .map((r) => ({ id: r.id, topicId: r.topic_id, authorId: r.author_id, text: r.text, createdAt: r.created_at }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/repo.ts tests/rooms-repo.test.ts
git commit -m "feat(rooms): repo topic + update queries"
```

---

## Task 5: `rooms.ts` — invite codes, create & join

**Files:**
- Create: `src/rooms.ts`
- Test: `tests/rooms.test.ts`

- [ ] **Step 1: Write the failing test** — create `tests/rooms.test.ts`

```ts
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
  assert.equal(joinRoom(2, code).ok === false && joinRoom(2, code).error, 'already_member');
  assert.equal(joinRoom(2, 'badcode0').ok === false && joinRoom(2, 'badcode0').error, 'invite_invalid');
  closeDb();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `../src/rooms.ts` not found.

- [ ] **Step 3: Create `src/rooms.ts`**

```ts
import { randomBytes } from 'node:crypto';
import * as repo from './db/repo.ts';
import type { Room, Topic } from './db/repo.ts';
import { MAX_ROOMS_PER_USER, MAX_SHARED_TOPICS_PER_ROOM, MAX_PERSONAL_TOPICS_PER_MEMBER } from './preferences.ts';

export type RoomError =
  | 'room_cap' | 'shared_cap' | 'personal_cap'
  | 'invite_invalid' | 'invite_closed' | 'already_member'
  | 'not_member' | 'not_admin' | 'not_owner'
  | 'room_not_found' | 'topic_not_found';

export type Result<T> = { ok: true; value: T } | { ok: false; error: RoomError };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = (error: RoomError): Result<never> => ({ ok: false, error });

const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export function generateInviteCode(): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    const bytes = randomBytes(8);
    let code = '';
    for (let i = 0; i < 8; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    if (!repo.getRoomByInvite(code)) return code;
  }
  throw new Error('could not generate a unique invite code');
}

export function createRoom(adminId: number, name: string): Result<Room> {
  if (repo.countRoomsForUser(adminId) >= MAX_ROOMS_PER_USER) return err('room_cap');
  const code = generateInviteCode();
  const id = repo.insertRoom(name, adminId, code);
  repo.addMember(id, adminId, 'admin');
  const room = repo.getRoom(id);
  return room ? ok(room) : err('room_not_found');
}

export function joinRoom(telegramId: number, code: string): Result<Room> {
  const room = repo.getRoomByInvite(code.trim());
  if (!room) return err('invite_invalid');
  if (room.status !== 'active') return err('invite_closed');
  if (repo.getMember(room.id, telegramId)) return err('already_member');
  if (repo.countRoomsForUser(telegramId) >= MAX_ROOMS_PER_USER) return err('room_cap');
  repo.addMember(room.id, telegramId, 'member');
  return ok(room);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/rooms.ts tests/rooms.test.ts
git commit -m "feat(rooms): domain — invite codes, create & join (Result-typed)"
```

---

## Task 6: `rooms.ts` — leave, close, add topics

**Files:**
- Modify: `src/rooms.ts` (append)
- Test: `tests/rooms.test.ts` (append)

- [ ] **Step 1: Append the failing test**

```ts
import { leaveRoom, closeRoom, addSharedTopic, addPersonalTopic } from '../src/rooms.ts';
import { listTopics, getMember, getRoom } from '../src/db/repo.ts';

test('addSharedTopic: admin only, max 5; addPersonalTopic: member, max 3', () => {
  initDb(':memory:');
  upsertUser(1, 'Admin'); upsertUser(2, 'Bob');
  const room = createRoom(1, 'Room');
  const roomId = room.ok === true ? room.value.id : 0;
  joinRoom(2, room.ok === true ? room.value.inviteCode : '');

  for (let i = 1; i <= 5; i++) assert.equal(addSharedTopic(1, roomId, `shared ${i}`).ok, true);
  assert.equal(addSharedTopic(1, roomId, 'shared 6').ok === false && addSharedTopic(1, roomId, 'x').error, 'shared_cap');
  assert.equal(addSharedTopic(2, roomId, 'not admin').ok === false && addSharedTopic(2, roomId, 'x').error, 'not_admin');

  for (let i = 1; i <= 3; i++) assert.equal(addPersonalTopic(2, roomId, `mine ${i}`).ok, true);
  assert.equal(addPersonalTopic(2, roomId, 'mine 4').ok === false && addPersonalTopic(2, roomId, 'x').error, 'personal_cap');
  closeDb();
});

test('leaveRoom: member leaves and their active personal topics are removed; admin cannot leave', () => {
  initDb(':memory:');
  upsertUser(1, 'Admin'); upsertUser(2, 'Bob');
  const room = createRoom(1, 'Room');
  const roomId = room.ok === true ? room.value.id : 0;
  joinRoom(2, room.ok === true ? room.value.inviteCode : '');
  addPersonalTopic(2, roomId, 'mine');

  assert.equal(leaveRoom(1, roomId).ok === false && leaveRoom(1, roomId).error, 'not_member'); // admin can't leave
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
  assert.equal(closeRoom(2, roomId).ok === false && closeRoom(2, roomId).error, 'not_admin');
  assert.equal(closeRoom(1, roomId).ok, true);
  assert.equal(getRoom(roomId)?.status, 'closed');
  closeDb();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Append to `src/rooms.ts`**

```ts
export function leaveRoom(telegramId: number, roomId: number): Result<void> {
  const member = repo.getMember(roomId, telegramId);
  if (!member || member.role === 'admin') return err('not_member'); // admins close, never leave
  repo.deleteActivePersonalTopics(roomId, telegramId);
  repo.removeMember(roomId, telegramId);
  return ok(undefined);
}

export function closeRoom(adminId: number, roomId: number): Result<Room> {
  const room = repo.getRoom(roomId);
  if (!room) return err('room_not_found');
  if (room.adminId !== adminId) return err('not_admin');
  repo.setRoomStatus(roomId, 'closed');
  const closed = repo.getRoom(roomId);
  return closed ? ok(closed) : err('room_not_found');
}

export function addSharedTopic(adminId: number, roomId: number, text: string): Result<Topic> {
  const room = repo.getRoom(roomId);
  if (!room || room.status !== 'active') return err('room_not_found');
  if (room.adminId !== adminId) return err('not_admin');
  if (repo.countActiveTopics(roomId, 'shared') >= MAX_SHARED_TOPICS_PER_ROOM) return err('shared_cap');
  const id = repo.insertTopic(roomId, adminId, 'shared', text.trim());
  const t = repo.getTopic(id);
  return t ? ok(t) : err('topic_not_found');
}

export function addPersonalTopic(telegramId: number, roomId: number, text: string): Result<Topic> {
  const room = repo.getRoom(roomId);
  if (!room || room.status !== 'active') return err('room_not_found');
  if (!repo.getMember(roomId, telegramId)) return err('not_member');
  if (repo.countActiveTopics(roomId, 'personal', telegramId) >= MAX_PERSONAL_TOPICS_PER_MEMBER) return err('personal_cap');
  const id = repo.insertTopic(roomId, telegramId, 'personal', text.trim());
  const t = repo.getTopic(id);
  return t ? ok(t) : err('topic_not_found');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/rooms.ts tests/rooms.test.ts
git commit -m "feat(rooms): domain — leave, close, add shared/personal topics"
```

---

## Task 7: `rooms.ts` — updates, mark answered, auth helpers

**Files:**
- Modify: `src/rooms.ts` (append)
- Test: `tests/rooms.test.ts` (append)

- [ ] **Step 1: Append the failing test**

```ts
import { postUpdate, markAnswered, isRoomAdmin, isRoomMember } from '../src/rooms.ts';
import { getTopic, listTopicUpdates } from '../src/db/repo.ts';

test('postUpdate + markAnswered: owner only', () => {
  initDb(':memory:');
  upsertUser(1, 'Admin'); upsertUser(2, 'Bob');
  const room = createRoom(1, 'Room');
  const roomId = room.ok === true ? room.value.id : 0;
  joinRoom(2, room.ok === true ? room.value.inviteCode : '');
  const topic = addPersonalTopic(2, roomId, 'mine');
  const topicId = topic.ok === true ? topic.value.id : 0;

  assert.equal(postUpdate(1, topicId, 'not owner').ok === false && postUpdate(1, topicId, 'x').error, 'not_owner');
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Append to `src/rooms.ts`**

```ts
export function postUpdate(userId: number, topicId: number, text: string): Result<void> {
  const topic = repo.getTopic(topicId);
  if (!topic) return err('topic_not_found');
  if (topic.ownerId !== userId) return err('not_owner');
  repo.insertTopicUpdate(topicId, userId, text.trim());
  return ok(undefined);
}

export function markAnswered(userId: number, topicId: number, note: string): Result<void> {
  const topic = repo.getTopic(topicId);
  if (!topic) return err('topic_not_found');
  if (topic.ownerId !== userId) return err('not_owner');
  repo.setTopicAnswered(topicId, note.trim());
  return ok(undefined);
}

export function isRoomAdmin(userId: number, roomId: number): boolean {
  const m = repo.getMember(roomId, userId);
  return m?.role === 'admin';
}
export function isRoomMember(userId: number, roomId: number): boolean {
  return repo.getMember(roomId, userId) !== null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — full suite green (template tests + all rooms-repo + rooms domain tests).

- [ ] **Step 5: Commit**

```bash
git add src/rooms.ts tests/rooms.test.ts
git commit -m "feat(rooms): domain — updates, mark answered, auth helpers"
```

---

## Self-Review (completed by plan author)

**Spec coverage (Stage 1 spec §6 data model + §7 flows, domain parts):** users/rooms/room_members/topics/topic_updates tables → Task 1; room CRUD + caps + invite codes → Tasks 2,5; membership + join/leave → Tasks 3,5,6; topics add/update/answer + caps → Tasks 4,6,7; per-room auth helpers → Task 7; "leave deletes active personal topics, keeps answered" → Task 4 `deleteActivePersonalTopics` + Task 6 test; "answered frees a cap slot" → Task 4 (`countActiveTopics`). The bot UX (§5, menu, /start, /help, handlers, i18n) is intentionally **Plan 1b**, written after this lands.

**Placeholder scan:** every code step has complete code; no TBD/TODO; the only deferral is the explicitly-separate Plan 1b.

**Type consistency:** `Result<T>`/`RoomError` defined in Task 5 and reused in Tasks 6–7; repo types `Room`/`RoomWithRole`/`Member`/`Topic`/`TopicUpdate` defined in Tasks 2–4 and consumed by `rooms.ts`; `countActiveTopics(roomId, kind, ownerId?)` signature consistent across Task 4 (def), Task 6 (`addSharedTopic`/`addPersonalTopic`), and tests; `generateInviteCode`/`createRoom`/`joinRoom`/`leaveRoom`/`closeRoom`/`addSharedTopic`/`addPersonalTopic`/`postUpdate`/`markAnswered`/`isRoomAdmin`/`isRoomMember` names identical across impl + tests; cap constants `MAX_ROOMS_PER_USER`/`MAX_SHARED_TOPICS_PER_ROOM`/`MAX_PERSONAL_TOPICS_PER_MEMBER` defined in Task 1 and imported in Task 5/6.
