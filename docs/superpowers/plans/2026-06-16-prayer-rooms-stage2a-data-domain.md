# Prayer Rooms — Stage 2a (Daily Rotation: Data & Domain) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the pure data + domain layer for Stage 2's daily prayer rhythm — schema for user reminder prefs / daily assignments / prayer log, the repo queries, and a new `assignments.ts` (timezone/day helpers, shared-topic rotation, the personal-topic assignment algorithm, reminder-due math, prayer recording) — fully unit-tested, no Telegram.

**Architecture:** DDL in `db/connection.ts` (additive `ALTER` for `users`, new tables); all SQL in `db/repo.ts`; rotation/assignment/timezone logic in a new `src/assignments.ts` with **pure** core functions (arrays in → result out) plus thin DB-orchestration wrappers. Single bot timezone (`config.tz`, Europe/Podgorica). Coverage guarantee: every active personal topic is prayed for within a rotation cycle.

**Tech Stack:** TypeScript (Node ≥24 type-stripping), better-sqlite3, `node:test`, `Intl.DateTimeFormat` for timezone date/time. Tests use `initDb(':memory:')` and inject `now: Date` for determinism.

**Conventions:** `.ts` imports; erasable-only TS; all SQL in connection.ts/repo.ts; `npm test` green; one commit per task; never reference any internal/reference app. Pure functions take an injected `now`/arrays so tests need no real clock or DB where possible.

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `src/db/connection.ts` | modify | `ALTER users` (timezone/reminder_time/reminder_enabled) via PRAGMA-guarded migration; new `daily_assignment` + `prayer_log` tables |
| `src/db/repo.ts` | modify | user-prefs, daily_assignment, prayer_log queries + active-topic/active-room helpers |
| `src/assignments.ts` | create | pure: `localDate`/`localTime`/`dayNumber`, `sharedTopicOfDay`, `assignPersonalTopics`, `isReminderDue`; DB wrappers: `generateDailyAssignments`, `recordPrayer` |
| `tests/assignments.test.ts` | create | pure-logic + DB-orchestration tests |
| `tests/rooms-repo.test.ts` | modify | append Stage 2 repo tests |

---

## Task 1: Schema — user prefs, daily_assignment, prayer_log

**Files:**
- Modify: `src/db/connection.ts`
- Test: `tests/rooms-repo.test.ts` (append)

- [ ] **Step 1: Append the failing test** to `tests/rooms-repo.test.ts`

```ts
test('Stage 2 schema: user pref columns + daily_assignment + prayer_log exist', () => {
  const db = initDb(':memory:');
  const cols = (db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[]).map((c) => c.name);
  for (const c of ['timezone', 'reminder_time', 'reminder_enabled']) assert.ok(cols.includes(c), `users.${c} missing`);
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((t) => t.name);
  assert.ok(tables.includes('daily_assignment'));
  assert.ok(tables.includes('prayer_log'));
  closeDb();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — columns/tables missing.

- [ ] **Step 3: Add schema to `src/db/connection.ts`**

In `initDb()`, after the Stage 1 tables and before `runMigrations(db)`, add the two new tables:

```ts
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_assignment (
      date              TEXT NOT NULL,
      room_id           INTEGER NOT NULL,
      telegram_id       INTEGER NOT NULL,
      shared_topic_id   INTEGER,
      personal_topic_id INTEGER,
      created_at        TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (date, room_id, telegram_id)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_assign_user_date ON daily_assignment(telegram_id, date)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS prayer_log (
      telegram_id INTEGER NOT NULL,
      room_id     INTEGER NOT NULL,
      topic_id    INTEGER NOT NULL,
      prayed_date TEXT NOT NULL,
      prayed_at   TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (telegram_id, topic_id, prayed_date)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_prayer_room_date ON prayer_log(room_id, prayed_date)`);
```

Then add the additive `users` columns inside the existing `runMigrations(db)` function body (replace its no-op body), using the PRAGMA-guarded pattern:

```ts
function runMigrations(db: DB): void {
  const cols = (db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes('timezone')) db.exec(`ALTER TABLE users ADD COLUMN timezone TEXT`);
  if (!cols.includes('reminder_time')) db.exec(`ALTER TABLE users ADD COLUMN reminder_time TEXT`);
  if (!cols.includes('reminder_enabled')) db.exec(`ALTER TABLE users ADD COLUMN reminder_enabled INTEGER DEFAULT 1`);
}
```
> NOTE: `runMigrations` currently takes `_db` and has an empty body — rename the param to `db` and add the above. Keep it called after the `CREATE TABLE` block (existing order) so `users` exists before the ALTER.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — new columns + tables present; existing tests green.

- [ ] **Step 5: Commit**

```bash
git add src/db/connection.ts tests/rooms-repo.test.ts
git commit -m "feat(stage2): schema — user reminder prefs, daily_assignment, prayer_log"
```

---

## Task 2: Repo — prefs, assignments, prayer log, helpers

**Files:**
- Modify: `src/db/repo.ts` (append)
- Test: `tests/rooms-repo.test.ts` (append)

- [ ] **Step 1: Append the failing test**

```ts
import {
  setReminderTime, getUserPrefs, listReminderRecipients,
  upsertAssignment, getAssignmentsForUser, hasAssignmentsForRoomDate,
  recordPrayer, hasPrayed, listActiveTopics, listActiveRooms,
} from '../src/db/repo.ts';

test('Stage 2 repo: prefs, assignments, prayer log, helpers', () => {
  initDb(':memory:');
  upsertUser(1, 'A'); upsertUser(2, 'B');
  const roomId = insertRoom('Room', 1, 'codecccc');
  addMember(roomId, 1, 'admin'); addMember(roomId, 2, 'member');
  const shared = insertTopic(roomId, 1, 'shared', 'church');
  const personal = insertTopic(roomId, 2, 'personal', 'exam');

  setReminderTime(1, '08:00');
  assert.equal(getUserPrefs(1)?.reminderTime, '08:00');
  assert.deepEqual(listReminderRecipients().map((r) => r.telegramId), [1]);

  upsertAssignment('2026-06-17', roomId, 2, shared, personal);
  assert.equal(getAssignmentsForUser(2, '2026-06-17').length, 1);
  assert.equal(hasAssignmentsForRoomDate(roomId, '2026-06-17'), true);
  assert.equal(hasAssignmentsForRoomDate(roomId, '2026-06-18'), false);

  assert.equal(hasPrayed(2, personal, '2026-06-17'), false);
  recordPrayer(2, roomId, personal, '2026-06-17');
  recordPrayer(2, roomId, personal, '2026-06-17'); // idempotent
  assert.equal(hasPrayed(2, personal, '2026-06-17'), true);

  assert.equal(listActiveTopics(roomId, 'shared').length, 1);
  assert.equal(listActiveTopics(roomId, 'personal').length, 1);
  assert.deepEqual(listActiveRooms().map((r) => r.id), [roomId]);
  closeDb();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Append to `src/db/repo.ts`**

```ts
// ─────────────────────────── Stage 2: prefs / assignments / prayer log ──────

export interface UserPrefs { telegramId: number; timezone: string | null; reminderTime: string | null; reminderEnabled: boolean; }

export function getUserPrefs(telegramId: number): UserPrefs | null {
  const r = getDb().prepare(
    `SELECT telegram_id, timezone, reminder_time, reminder_enabled FROM users WHERE telegram_id = ?`,
  ).get(telegramId) as { telegram_id: number; timezone: string | null; reminder_time: string | null; reminder_enabled: number } | undefined;
  return r ? { telegramId: r.telegram_id, timezone: r.timezone, reminderTime: r.reminder_time, reminderEnabled: !!r.reminder_enabled } : null;
}
export function setReminderTime(telegramId: number, time: string | null): void {
  getDb().prepare(`UPDATE users SET reminder_time = ? WHERE telegram_id = ?`).run(time, telegramId);
}
export function setReminderEnabled(telegramId: number, enabled: boolean): void {
  getDb().prepare(`UPDATE users SET reminder_enabled = ? WHERE telegram_id = ?`).run(enabled ? 1 : 0, telegramId);
}
// Users who should get a reminder today: a time set and reminders enabled.
export function listReminderRecipients(): { telegramId: number; reminderTime: string }[] {
  return (getDb().prepare(
    `SELECT telegram_id, reminder_time FROM users WHERE reminder_time IS NOT NULL AND reminder_enabled = 1`,
  ).all() as { telegram_id: number; reminder_time: string }[]).map((r) => ({ telegramId: r.telegram_id, reminderTime: r.reminder_time }));
}

export interface Assignment { date: string; roomId: number; telegramId: number; sharedTopicId: number | null; personalTopicId: number | null; }
export function upsertAssignment(date: string, roomId: number, telegramId: number, sharedTopicId: number | null, personalTopicId: number | null): void {
  getDb().prepare(
    `INSERT INTO daily_assignment (date, room_id, telegram_id, shared_topic_id, personal_topic_id)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(date, room_id, telegram_id) DO UPDATE SET shared_topic_id = excluded.shared_topic_id, personal_topic_id = excluded.personal_topic_id`,
  ).run(date, roomId, telegramId, sharedTopicId, personalTopicId);
}
export function getAssignmentsForUser(telegramId: number, date: string): Assignment[] {
  return (getDb().prepare(
    `SELECT date, room_id, telegram_id, shared_topic_id, personal_topic_id FROM daily_assignment WHERE telegram_id = ? AND date = ?`,
  ).all(telegramId, date) as { date: string; room_id: number; telegram_id: number; shared_topic_id: number | null; personal_topic_id: number | null }[])
    .map((r) => ({ date: r.date, roomId: r.room_id, telegramId: r.telegram_id, sharedTopicId: r.shared_topic_id, personalTopicId: r.personal_topic_id }));
}
export function hasAssignmentsForRoomDate(roomId: number, date: string): boolean {
  return !!getDb().prepare(`SELECT 1 FROM daily_assignment WHERE room_id = ? AND date = ? LIMIT 1`).get(roomId, date);
}

export function recordPrayer(telegramId: number, roomId: number, topicId: number, prayedDate: string): void {
  getDb().prepare(
    `INSERT OR IGNORE INTO prayer_log (telegram_id, room_id, topic_id, prayed_date) VALUES (?, ?, ?, ?)`,
  ).run(telegramId, roomId, topicId, prayedDate);
}
export function hasPrayed(telegramId: number, topicId: number, prayedDate: string): boolean {
  return !!getDb().prepare(
    `SELECT 1 FROM prayer_log WHERE telegram_id = ? AND topic_id = ? AND prayed_date = ?`,
  ).get(telegramId, topicId, prayedDate);
}

// Active topics of a kind in a room, ordered by id (stable rotation order).
export function listActiveTopics(roomId: number, kind: TopicKind): Topic[] {
  return (getDb().prepare(
    `SELECT * FROM topics WHERE room_id = ? AND kind = ? AND status = 'active' ORDER BY id`,
  ).all(roomId, kind) as TopicRow[]).map(toTopic);
}
export function listActiveRooms(): Room[] {
  return (getDb().prepare(`SELECT * FROM rooms WHERE status = 'active' ORDER BY id`).all() as RoomRow[]).map(toRoom);
}
```
> `TopicRow`/`toTopic`/`RoomRow`/`toRoom`/`TopicKind`/`Topic`/`Room` already exist from Stage 1a.

- [ ] **Step 4: Run test to verify it passes** — `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/repo.ts tests/rooms-repo.test.ts
git commit -m "feat(stage2): repo — prefs, assignments, prayer log, active-topic/room helpers"
```

---

## Task 3: `assignments.ts` — timezone/day helpers + shared rotation

**Files:**
- Create: `src/assignments.ts`
- Test: `tests/assignments.test.ts`

- [ ] **Step 1: Write the failing test** — create `tests/assignments.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDate, localTime, dayNumber, sharedTopicOfDay, isReminderDue } from '../src/assignments.ts';
import type { Topic } from '../src/db/repo.ts';

const topic = (id: number, ownerId = 1): Topic => ({
  id, roomId: 1, ownerId, kind: 'shared', text: `t${id}`, status: 'active',
  answerNote: null, createdAt: '', answeredAt: null,
});

test('localDate/localTime format in the given timezone', () => {
  const now = new Date('2026-06-17T22:30:00Z'); // 00:30 next day in Europe/Podgorica (UTC+2 summer)
  assert.equal(localDate(now, 'Europe/Podgorica'), '2026-06-18');
  assert.equal(localTime(now, 'Europe/Podgorica'), '00:30');
});

test('dayNumber is a stable integer that increments by 1 per calendar day', () => {
  assert.equal(dayNumber('2026-06-18') - dayNumber('2026-06-17'), 1);
});

test('sharedTopicOfDay rotates in order and is null when none', () => {
  const shared = [topic(10), topic(11), topic(12)];
  assert.equal(sharedTopicOfDay(shared, 0)?.id, 10);
  assert.equal(sharedTopicOfDay(shared, 1)?.id, 11);
  assert.equal(sharedTopicOfDay(shared, 3)?.id, 10); // wraps
  assert.equal(sharedTopicOfDay([], 5), null);
});

test('isReminderDue matches the local HH:MM minute', () => {
  const now = new Date('2026-06-17T06:00:30Z'); // 08:00 in Europe/Podgorica (UTC+2)
  assert.equal(isReminderDue('08:00', now, 'Europe/Podgorica'), true);
  assert.equal(isReminderDue('08:01', now, 'Europe/Podgorica'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `../src/assignments.ts` not found.

- [ ] **Step 3: Create `src/assignments.ts`**

```ts
import type { Topic } from './db/repo.ts';

// 'YYYY-MM-DD' for `now` in the given IANA timezone (en-CA gives ISO-like date).
export function localDate(now: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

// 'HH:MM' (24h) for `now` in the given timezone.
export function localTime(now: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now);
}

// Stable integer day index from a 'YYYY-MM-DD' string (days since the unix epoch).
export function dayNumber(dateStr: string): number {
  return Math.floor(Date.parse(`${dateStr}T00:00:00Z`) / 86_400_000);
}

// Today's shared topic: rotate the active shared topics in order. Null if none.
export function sharedTopicOfDay(activeShared: Topic[], dayNum: number): Topic | null {
  if (activeShared.length === 0) return null;
  return activeShared[((dayNum % activeShared.length) + activeShared.length) % activeShared.length];
}

// Due when the current local minute equals the member's reminder time.
export function isReminderDue(reminderTime: string, now: Date, tz: string): boolean {
  return localTime(now, tz) === reminderTime;
}
```
> `localTime` with `en-GB` + `hour12:false` can render midnight as `'24:00'` on some runtimes; if a test shows that, normalize `'24'`→`'00'` in `localTime`. (The plan's tests use 00:30/08:00 to avoid the boundary; add the normalization only if observed.)

- [ ] **Step 4: Run test to verify it passes** — `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/assignments.ts tests/assignments.test.ts
git commit -m "feat(stage2): assignments — timezone/day helpers + shared rotation"
```

---

## Task 4: `assignments.ts` — personal-topic assignment algorithm

**Files:**
- Modify: `src/assignments.ts` (append)
- Test: `tests/assignments.test.ts` (append)

The algorithm: each member gets one other member's active personal topic, rotated by day, never their own; coverage of all topics within a cycle.

- [ ] **Step 1: Append the failing test**

```ts
import { assignPersonalTopics } from '../src/assignments.ts';

const p = (id: number, ownerId: number) => ({ id, ownerId });

test('assignPersonalTopics: never self, one per member, covers all within a cycle', () => {
  const members = [1, 2, 3];
  const topics = [p(10, 1), p(11, 2), p(12, 3)]; // each member owns one
  const coveredAcrossCycle = new Set<number>();
  for (let day = 0; day < 3; day++) {
    const map = assignPersonalTopics(members, topics, day);
    for (const member of members) {
      const tid = map.get(member);
      assert.notEqual(tid, null);                       // everyone gets one
      const owner = topics.find((t) => t.id === tid)!.ownerId;
      assert.notEqual(owner, member);                   // never your own
      if (tid != null) coveredAcrossCycle.add(tid);
    }
  }
  assert.deepEqual([...coveredAcrossCycle].sort((a, b) => a - b), [10, 11, 12]); // all covered over the cycle
});

test('assignPersonalTopics edge cases', () => {
  assert.equal(assignPersonalTopics([1], [], 0).get(1), null);              // no topics → null
  assert.equal(assignPersonalTopics([1], [p(10, 1)], 0).get(1), null);     // only own topic → null
  // member with no own topic still gets assigned someone else's
  assert.equal(assignPersonalTopics([1, 2], [p(11, 2)], 0).get(1), 11);
  assert.equal(assignPersonalTopics([1, 2], [p(11, 2)], 0).get(2), null);  // owner 2 can't get own
});
```

- [ ] **Step 2: Run test to verify it fails** — `npm test` → FAIL (`assignPersonalTopics` not exported).

- [ ] **Step 3: Append to `src/assignments.ts`**

```ts
// Assign each member one OTHER member's personal topic, rotated by day.
// Returns member id → topic id (or null when no eligible topic exists).
// Coverage: over a full cycle of days, every topic is prayed for by someone.
export function assignPersonalTopics(
  memberIds: number[], topics: { id: number; ownerId: number }[], dayNum: number,
): Map<number, number | null> {
  const result = new Map<number, number | null>();
  const m = topics.length;
  memberIds.forEach((member, i) => {
    if (m === 0) { result.set(member, null); return; }
    for (let k = 0; k < m; k++) {
      const idx = (((i + dayNum + k) % m) + m) % m;
      const candidate = topics[idx];
      if (candidate.ownerId !== member) { result.set(member, candidate.id); return; }
    }
    result.set(member, null); // every topic belongs to this member
  });
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes** — `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/assignments.ts tests/assignments.test.ts
git commit -m "feat(stage2): assignments — personal-topic rotation algorithm"
```

---

## Task 5: `assignments.ts` — generate (DB) + record prayer

**Files:**
- Modify: `src/assignments.ts` (append)
- Test: `tests/assignments.test.ts` (append)

- [ ] **Step 1: Append the failing test**

```ts
import { initDb, closeDb } from '../src/db/connection.ts';
import { upsertUser, insertRoom, addMember, insertTopic, getAssignmentsForUser, hasPrayed } from '../src/db/repo.ts';
import { generateDailyAssignments, recordPrayer } from '../src/assignments.ts';

test('generateDailyAssignments writes one row per member with shared+personal', () => {
  initDb(':memory:');
  upsertUser(1, 'A'); upsertUser(2, 'B');
  const roomId = insertRoom('Room', 1, 'codedddd');
  addMember(roomId, 1, 'admin'); addMember(roomId, 2, 'member');
  insertTopic(roomId, 1, 'shared', 'church');
  insertTopic(roomId, 1, 'personal', 'admin-personal');
  insertTopic(roomId, 2, 'personal', 'b-personal');

  generateDailyAssignments(roomId, '2026-06-17');
  const a1 = getAssignmentsForUser(1, '2026-06-17')[0];
  const a2 = getAssignmentsForUser(2, '2026-06-17')[0];
  assert.ok(a1.sharedTopicId && a2.sharedTopicId);
  assert.equal(a1.sharedTopicId, a2.sharedTopicId);           // same shared topic for everyone
  assert.notEqual(a1.personalTopicId, null);                  // each gets a personal (the other's)
  assert.notEqual(a2.personalTopicId, null);

  generateDailyAssignments(roomId, '2026-06-17');             // idempotent re-run, no duplicate rows
  assert.equal(getAssignmentsForUser(1, '2026-06-17').length, 1);

  recordPrayer(1, roomId, a1.sharedTopicId as number, '2026-06-17');
  assert.equal(hasPrayed(1, a1.sharedTopicId as number, '2026-06-17'), true);
  closeDb();
});
```

- [ ] **Step 2: Run test to verify it fails** — `npm test` → FAIL.

- [ ] **Step 3: Append to `src/assignments.ts`**

```ts
import * as repo from './db/repo.ts';

// Precompute one room's assignments for a date (idempotent via upsert).
export function generateDailyAssignments(roomId: number, date: string): void {
  const day = dayNumber(date);
  const shared = sharedTopicOfDay(repo.listActiveTopics(roomId, 'shared'), day);
  const members = repo.listMembers(roomId).map((m) => m.telegramId);
  const personalTopics = repo.listActiveTopics(roomId, 'personal').map((t) => ({ id: t.id, ownerId: t.ownerId }));
  const personalByMember = assignPersonalTopics(members, personalTopics, day);
  for (const member of members) {
    repo.upsertAssignment(date, roomId, member, shared ? shared.id : null, personalByMember.get(member) ?? null);
  }
}

// Thin wrapper so the bot layer records prayers through the domain module.
export function recordPrayer(telegramId: number, roomId: number, topicId: number, date: string): void {
  repo.recordPrayer(telegramId, roomId, topicId, date);
}
```
> `import * as repo` is added at the top with the other imports if not already present (Task 4 didn't need it; this task does). Keep `import type { Topic }` separate.

- [ ] **Step 4: Run test to verify it passes** — `npm test` → PASS (full suite green).

- [ ] **Step 5: Commit**

```bash
git add src/assignments.ts tests/assignments.test.ts
git commit -m "feat(stage2): assignments — generate daily assignments + record prayer"
```

---

## Self-Review (completed by plan author)

**Spec coverage (Stage 2 spec §5 data model + §6 mechanics, domain parts):** user prefs columns + daily_assignment + prayer_log → Task 1; prefs/assignment/prayer-log/active-topic/active-room queries → Task 2; timezone/day helpers + shared rotation (R1) + reminder-due (R6 timing) → Task 3; personal assignment + coverage + no-self + edge cases (R2) → Task 4; precomputed per-room generation (R4) + prayer recording → Task 5. Single bot tz (R3) via `config.tz` passed by the caller. The scheduler dispatch, per-topic reminder messages, prayed-button, voice/video forwarding, and reminder-time UX (R5/R6 delivery) are **Plan 2b** (need Telegram + scheduler), written after this lands.

**Placeholder scan:** every code step has complete code; no TBD. The `localTime` `'24:00'` note is a conditional micro-fix, not a placeholder (tests avoid the boundary).

**Type consistency:** reuses Stage 1a `Topic`/`Room`/`TopicKind`/`TopicRow`/`toTopic`/`RoomRow`/`toRoom`/`listMembers`; new repo exports (`getUserPrefs`/`setReminderTime`/`setReminderEnabled`/`listReminderRecipients`/`upsertAssignment`/`getAssignmentsForUser`/`hasAssignmentsForRoomDate`/`recordPrayer`/`hasPrayed`/`listActiveTopics`/`listActiveRooms`) and `assignments.ts` exports (`localDate`/`localTime`/`dayNumber`/`sharedTopicOfDay`/`isReminderDue`/`assignPersonalTopics`/`generateDailyAssignments`/`recordPrayer`) used consistently across impl + tests; `assignments.recordPrayer` wraps `repo.recordPrayer` (same name, different module — intentional thin pass-through).
