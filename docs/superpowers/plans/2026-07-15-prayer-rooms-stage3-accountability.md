# Prayer Rooms — Stage 3 (Accountability) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A non-admin member who misses 2 consecutive days gets exactly one warm warning; missing 5 consecutive days removes them from that room (member + admin DM'd, personal topics handled like "leave"); any prayer resets the streak; admins are never auto-removed from their own rooms; evaluation is wall-clock-derived so a missed daily tick can't skip or double-act.

**Architecture:** A new `src/accountability.ts` holds two pure functions (`computeMissStreak`, `decideAction`) plus an orchestrator `evaluateAccountability(now, tz, notify)` with an **injected `NotifyFn`** (plain DM, no keyboard — distinct from Stage 2's `SendFn`). The streak is **derived, not incremented**: `missStreak = max(0, dayNumber(today) − 1 − dayNumber(anchor))` where `anchor = max(lastPrayedDate, joinDate)` — any prayer moves the anchor, so resets are automatic and catch-up is safe by construction. `membership_state` (spec §4) stores `warned_at` for warn-once idempotency (plus the computed streak for observability); `prayer_log` stays the source of truth. The scheduler adds a daily 09:00 cron job; `index.ts` also fires one catch-up evaluation on boot (spec §5).

**Tech Stack:** TypeScript (Node ≥24), Telegraf 4, node-cron, better-sqlite3, `node:test`. Stage 2 (`prayer_log`, `assignments.ts` helpers, per-minute dispatcher) is in place.

## Resolved design decisions (spec §6)

- **O1 — Day counting.** A "missed day" is a full local day (bot tz) with no `prayer_log` row for that member+room. The streak counts consecutive missed days **ending yesterday** (today never counts — the member may still pray). Warn when streak ≥ 2 and not yet warned; remove when streak ≥ 5 **and** the warning is ≥ 3 days old (guarantees a warning always precedes removal, even after downtime — first tick after long downtime warns, removal follows 3 days later if silence continues).
- **O2 — Timezone.** Single bot timezone `config.tz` — same as Stage 2 reminders (users have no per-user tz in use). Join date is taken as the UTC date part of `room_members.joined_at` (hours-level approximation, acceptable).
- **O3 — Grace.** The join day never counts as missed: the anchor starts at `joinDate`, so counting starts the day **after** joining. Earliest possible warning is the morning of day join+3; earliest removal join+6. Rejoin after removal gets the same grace (anchor = max(lastPrayed, joinDate) — old `prayer_log` rows can't shorten it).
- **O4 — Warn idempotency & reset.** `warned_at` in `membership_state` = date the warning was sent; warn only when `warned_at` is null. Cleared when the member prays on/after the warning date, or the streak drops below 2 (robust to missed ticks).
- **O5 — Admin exemption.** Evaluation iterates only `role = 'member'` rows of **active** rooms — a room's admin is never evaluated in their own room but is a plain `member` elsewhere and subject there.
- **O6 — Edge cases.** Removal may leave a room with only the admin (allowed). Multi-room members are evaluated per room independently. Wording is warm, not punitive (church tone). Per-member try/catch: one failed DM never blocks the rest of the sweep.

## Global Constraints

- Node ≥ 24, erasable-only TS, `.ts` import extensions, `verbatimModuleSyntax` (use `import type`).
- ALL SQL in `src/db/connection.ts` (DDL) + `src/db/repo.ts` (DML) — no other src module imports `getDb()` (tests may).
- Log lines start with a `LOG_PREFIX` bracket (scheduler work → `[scheduler]`).
- i18n: every new key in **uk, en, ru**; uk is the default locale.
- `npm test` green after every task; one commit per task; commit style `feat(stage3): …`.

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `src/db/connection.ts` | modify | `membership_state` table (spec §4 DDL) |
| `src/db/repo.ts` | modify | membership_state CRUD, `lastPrayedDate`, `listEvaluableMemberships`, `getDisplayName` |
| `src/i18n.ts` | modify | `accountability_warning`, `removed_member`, `removed_admin` (uk/en/ru) |
| `src/accountability.ts` | create | pure `computeMissStreak` + `decideAction`; orchestrator `evaluateAccountability` (injected `NotifyFn`) |
| `src/rooms.ts` | modify | `leaveRoom` also deletes the membership_state row |
| `src/scheduler.ts` | modify | daily 09:00 accountability job; `notify` dep |
| `src/index.ts` | modify | `notify` closure; boot catch-up evaluation |
| `tests/rooms-repo.test.ts` | append | membership_state + helpers repo test |
| `tests/i18n.test.ts` | append | new keys resolve in all locales |
| `tests/accountability.test.ts` | create | pure logic + orchestration (stub notify, in-memory DB) |
| `tests/scheduler.test.ts` | modify | new `notify` dep, ≥2 tasks |
| `CLAUDE.md`, `docs/qa/stage3-test-cases.md`, spec | modify/create | docs + QA checklist + mark §6 resolved |

---

## Task 1: `membership_state` schema + Stage 3 repo functions

**Files:**
- Modify: `src/db/connection.ts` (DDL in `initDb()`, after the `sent_assignment` block, before `runMigrations`)
- Modify: `src/db/repo.ts` (append at end)
- Test: `tests/rooms-repo.test.ts` (append)

**Interfaces:**
- Consumes: existing `getDb()`, `Room`/`toRoom` internals of repo.ts.
- Produces (used by Tasks 3–4):
  - `interface MembershipState { roomId: number; telegramId: number; lastPrayedDate: string | null; missStreak: number; warnedAt: string | null }`
  - `getMembershipState(roomId: number, telegramId: number): MembershipState | null`
  - `upsertMembershipState(roomId: number, telegramId: number, lastPrayedDate: string | null, missStreak: number, warnedAt: string | null): void`
  - `deleteMembershipState(roomId: number, telegramId: number): void`
  - `lastPrayedDate(telegramId: number, roomId: number): string | null`
  - `listEvaluableMemberships(): { roomId: number; telegramId: number; joinedAt: string }[]`
  - `getDisplayName(telegramId: number): string | null`

- [ ] **Step 1: Append the failing test** to `tests/rooms-repo.test.ts` (extend its existing import line from `../src/db/repo.ts` with the new names):

```ts
import {
  getMembershipState, upsertMembershipState, deleteMembershipState,
  lastPrayedDate, listEvaluableMemberships, getDisplayName, recordPrayer,
} from '../src/db/repo.ts';

test('membership_state: upsert/get/delete + lastPrayedDate + evaluable memberships + display name', () => {
  initDb(':memory:');
  upsertUser(1, 'Admin A'); upsertUser(2, 'Member B');
  const roomId = insertRoom('Room', 1, 'codestate');
  addMember(roomId, 1, 'admin'); addMember(roomId, 2, 'member');

  // state CRUD
  assert.equal(getMembershipState(roomId, 2), null);
  upsertMembershipState(roomId, 2, null, 2, '2026-07-10');
  assert.deepEqual(getMembershipState(roomId, 2), {
    roomId, telegramId: 2, lastPrayedDate: null, missStreak: 2, warnedAt: '2026-07-10',
  });
  upsertMembershipState(roomId, 2, '2026-07-12', 0, null); // upsert overwrites
  assert.equal(getMembershipState(roomId, 2)?.warnedAt, null);
  deleteMembershipState(roomId, 2);
  assert.equal(getMembershipState(roomId, 2), null);

  // lastPrayedDate = MAX(prayed_date) per member+room
  const topicId = insertTopic(roomId, 1, 'shared', 'church');
  assert.equal(lastPrayedDate(2, roomId), null);
  recordPrayer(2, roomId, topicId, '2026-07-10');
  recordPrayer(2, roomId, topicId, '2026-07-12');
  assert.equal(lastPrayedDate(2, roomId), '2026-07-12');

  // evaluable = role 'member' in active rooms only
  assert.deepEqual(listEvaluableMemberships(), [{ roomId, telegramId: 2, joinedAt: listEvaluableMemberships()[0].joinedAt }]);
  setRoomStatus(roomId, 'closed');
  assert.deepEqual(listEvaluableMemberships(), []);

  assert.equal(getDisplayName(2), 'Member B');
  assert.equal(getDisplayName(999), null);
  closeDb();
});
```

(`setRoomStatus` is already exported from repo.ts; add it to the import line if the file doesn't import it yet.)

- [ ] **Step 2: Run** `npm test` → FAIL (`membership_state` table / functions missing).

- [ ] **Step 3a: Add the table** in `src/db/connection.ts` `initDb()` (after the `sent_assignment` block):

```ts
  db.exec(`
    CREATE TABLE IF NOT EXISTS membership_state (
      room_id          INTEGER NOT NULL,
      telegram_id      INTEGER NOT NULL,
      last_prayed_date TEXT,
      miss_streak      INTEGER DEFAULT 0,
      warned_at        TEXT,
      PRIMARY KEY (room_id, telegram_id)
    )
  `);
```

- [ ] **Step 3b: Append repo functions** to `src/db/repo.ts`:

```ts
// ─────────────────────────── Stage 3: accountability ────────────────────────

export interface MembershipState { roomId: number; telegramId: number; lastPrayedDate: string | null; missStreak: number; warnedAt: string | null; }
export function getMembershipState(roomId: number, telegramId: number): MembershipState | null {
  const r = getDb().prepare(
    `SELECT room_id, telegram_id, last_prayed_date, miss_streak, warned_at FROM membership_state WHERE room_id = ? AND telegram_id = ?`,
  ).get(roomId, telegramId) as { room_id: number; telegram_id: number; last_prayed_date: string | null; miss_streak: number; warned_at: string | null } | undefined;
  return r ? { roomId: r.room_id, telegramId: r.telegram_id, lastPrayedDate: r.last_prayed_date, missStreak: r.miss_streak, warnedAt: r.warned_at } : null;
}
export function upsertMembershipState(roomId: number, telegramId: number, lastPrayedDate: string | null, missStreak: number, warnedAt: string | null): void {
  getDb().prepare(
    `INSERT INTO membership_state (room_id, telegram_id, last_prayed_date, miss_streak, warned_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(room_id, telegram_id) DO UPDATE SET
       last_prayed_date = excluded.last_prayed_date, miss_streak = excluded.miss_streak, warned_at = excluded.warned_at`,
  ).run(roomId, telegramId, lastPrayedDate, missStreak, warnedAt);
}
export function deleteMembershipState(roomId: number, telegramId: number): void {
  getDb().prepare(`DELETE FROM membership_state WHERE room_id = ? AND telegram_id = ?`).run(roomId, telegramId);
}
export function lastPrayedDate(telegramId: number, roomId: number): string | null {
  const r = getDb().prepare(
    `SELECT MAX(prayed_date) AS d FROM prayer_log WHERE telegram_id = ? AND room_id = ?`,
  ).get(telegramId, roomId) as { d: string | null };
  return r.d;
}
// Memberships subject to accountability: plain members of active rooms (admins exempt in their own room).
export function listEvaluableMemberships(): { roomId: number; telegramId: number; joinedAt: string }[] {
  return (getDb().prepare(
    `SELECT m.room_id, m.telegram_id, m.joined_at FROM room_members m JOIN rooms r ON r.id = m.room_id
     WHERE m.role = 'member' AND r.status = 'active' ORDER BY m.room_id, m.telegram_id`,
  ).all() as { room_id: number; telegram_id: number; joined_at: string }[])
    .map((r) => ({ roomId: r.room_id, telegramId: r.telegram_id, joinedAt: r.joined_at }));
}
export function getDisplayName(telegramId: number): string | null {
  const r = getDb().prepare(`SELECT display_name FROM users WHERE telegram_id = ?`).get(telegramId) as { display_name: string | null } | undefined;
  return r ? r.display_name : null;
}
```

- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/db/connection.ts src/db/repo.ts tests/rooms-repo.test.ts
git commit -m "feat(stage3): membership_state table + accountability repo functions"
```

---

## Task 2: i18n strings (uk/en/ru)

**Files:**
- Modify: `src/i18n.ts` (append inside each locale object, after `reminder_invalid`)
- Test: `tests/i18n.test.ts` (append)

**Interfaces:**
- Produces keys used by Task 4: `accountability_warning` (var `{room}`), `removed_member` (var `{room}`), `removed_admin` (vars `{name}`, `{room}`).

- [ ] **Step 1: Append the failing test** to `tests/i18n.test.ts`:

```ts
test('stage 3 accountability strings resolve in all locales', () => {
  for (const locale of ['uk', 'en', 'ru']) {
    assert.ok(t(locale, 'accountability_warning', { room: 'R' }).includes('R'));
    assert.ok(t(locale, 'removed_member', { room: 'R' }).includes('R'));
    const admin = t(locale, 'removed_admin', { name: 'N', room: 'R' });
    assert.ok(admin.includes('N') && admin.includes('R'));
  }
});
```

- [ ] **Step 2: Run** `npm test` → FAIL (keys missing; `t` falls back to the key name, which doesn't contain `R`).

- [ ] **Step 3: Add the strings** (warm, not punitive — spec O6):

`uk` (after `reminder_invalid`):
```ts
    accountability_warning: 'Ми сумуємо за вашими молитвами в кімнаті «{room}» 🙏 Минуло вже два дні. Якщо пауза триватиме 5 днів поспіль, ви вибудете з кімнати — але одне натискання «🙏 Помолився сьогодні» все скасовує.',
    removed_member: 'Ви вибули з кімнати «{room}» після 5 днів без молитви. Це не прощання — вас можуть запросити знову будь-коли. 🙏',
    removed_admin: '{name} вибув(-ла) з кімнати «{room}» після 5 днів без молитви. Ви можете надіслати запрошення знову будь-коли.',
```

`en`:
```ts
    accountability_warning: 'We miss your prayers in "{room}" 🙏 It has been two days. If the pause reaches 5 days in a row you will leave the room — but one tap on "🙏 Prayed today" resets everything.',
    removed_member: 'You have left "{room}" after 5 days without prayer. This is not goodbye — you can be invited back anytime. 🙏',
    removed_admin: '{name} left "{room}" after 5 days without prayer. You can send them an invite again anytime.',
```

`ru`:
```ts
    accountability_warning: 'Мы скучаем по вашим молитвам в комнате «{room}» 🙏 Прошло уже два дня. Если пауза достигнет 5 дней подряд, вы выбудете из комнаты — но одно нажатие «🙏 Помолился сегодня» всё отменяет.',
    removed_member: 'Вы выбыли из комнаты «{room}» после 5 дней без молитвы. Это не прощание — вас могут пригласить снова в любой момент. 🙏',
    removed_admin: '{name} выбыл(а) из комнаты «{room}» после 5 дней без молитвы. Вы можете отправить приглашение снова в любой момент.',
```

- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/i18n.ts tests/i18n.test.ts
git commit -m "feat(stage3): uk/en/ru accountability warning + removal strings"
```

---

## Task 3: pure streak + decision logic

**Files:**
- Create: `src/accountability.ts` (pure part only — orchestrator comes in Task 4)
- Test: `tests/accountability.test.ts` (create)

**Interfaces:**
- Consumes: `dayNumber(dateStr: string): number` from `src/assignments.ts`.
- Produces (used by Task 4 and its tests):
  - `computeMissStreak(lastPrayedDate: string | null, joinDate: string, today: string): number`
  - `type AccountabilityAction = 'none' | 'warn' | 'remove'`
  - `decideAction(streak: number, warnedAt: string | null, today: string): AccountabilityAction`

- [ ] **Step 1: Write the failing tests** — create `tests/accountability.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMissStreak, decideAction } from '../src/accountability.ts';

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
```

- [ ] **Step 2: Run** `npm test` → FAIL (module not found).

- [ ] **Step 3: Create** `src/accountability.ts`:

```ts
import { dayNumber } from './assignments.ts';

// Consecutive fully-missed local days ending yesterday. The join day never
// counts (grace), and any prayer moves the anchor forward — so the streak
// resets automatically and is safe to recompute after missed ticks.
export function computeMissStreak(lastPrayedDate: string | null, joinDate: string, today: string): number {
  const anchor = lastPrayedDate && lastPrayedDate > joinDate ? lastPrayedDate : joinDate;
  return Math.max(0, dayNumber(today) - 1 - dayNumber(anchor));
}

export type AccountabilityAction = 'none' | 'warn' | 'remove';

// Warn once per streak at >=2 missed days; remove at >=5 only when the warning
// is >=3 days old, so a warning always precedes removal even after downtime.
export function decideAction(streak: number, warnedAt: string | null, today: string): AccountabilityAction {
  if (streak >= 5 && warnedAt !== null && dayNumber(today) - dayNumber(warnedAt) >= 3) return 'remove';
  if (streak >= 2 && warnedAt === null) return 'warn';
  return 'none';
}
```

- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/accountability.ts tests/accountability.test.ts
git commit -m "feat(stage3): pure miss-streak + warn/remove decision logic"
```

---

## Task 4: `evaluateAccountability` orchestration + leave cleanup

**Files:**
- Modify: `src/accountability.ts` (append orchestrator)
- Modify: `src/rooms.ts` (`leaveRoom` also clears membership_state)
- Test: `tests/accountability.test.ts` (append)

**Interfaces:**
- Consumes: Task 1 repo functions; Task 2 i18n keys; Task 3 pure functions; `rooms.leaveRoom(telegramId, roomId)`; `localDate(now, tz)` from assignments.ts.
- Produces (used by Task 5):
  - `type NotifyFn = (chatId: number, text: string) => Promise<void>`
  - `evaluateAccountability(now: Date, tz: string, notify: NotifyFn): Promise<void>`

- [ ] **Step 1: Append the failing tests** to `tests/accountability.test.ts`:

```ts
import { initDb, closeDb, getDb } from '../src/db/connection.ts';
import {
  upsertUser, insertRoom, addMember, getMember, insertTopic, listTopics,
  recordPrayer, upsertMembershipState, getMembershipState,
} from '../src/db/repo.ts';
import { evaluateAccountability } from '../src/accountability.ts';

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
```

- [ ] **Step 2: Run** `npm test` → FAIL (`evaluateAccountability` not exported).

- [ ] **Step 3a: Append the orchestrator** to `src/accountability.ts`:

```ts
import * as repo from './db/repo.ts';
import * as rooms from './rooms.ts';
import { localDate } from './assignments.ts';
import { t } from './i18n.ts';
import config from './config.ts';
import { LOG_PREFIX } from './preferences.ts';

export type NotifyFn = (chatId: number, text: string) => Promise<void>;

// Daily sweep: recompute each plain member's miss-streak from prayer_log
// (wall-clock derived - idempotent + catch-up safe), warn at 2, remove at 5.
export async function evaluateAccountability(now: Date, tz: string, notify: NotifyFn): Promise<void> {
  const today = localDate(now, tz);
  const locale = config.defaultLocale;
  for (const m of repo.listEvaluableMemberships()) {
    const room = repo.getRoom(m.roomId);
    if (!room) continue;
    const lastPrayed = repo.lastPrayedDate(m.telegramId, m.roomId);
    const streak = computeMissStreak(lastPrayed, m.joinedAt.slice(0, 10), today);
    // a prayer on/after the warning date (or a streak below 2) makes the warning stale
    let warnedAt = repo.getMembershipState(m.roomId, m.telegramId)?.warnedAt ?? null;
    if (warnedAt && ((lastPrayed && lastPrayed >= warnedAt) || streak < 2)) warnedAt = null;
    try {
      const action = decideAction(streak, warnedAt, today);
      if (action === 'remove') {
        const res = rooms.leaveRoom(m.telegramId, m.roomId);
        if (!res.ok) {
          console.error(`${LOG_PREFIX.scheduler} auto-remove failed (${m.telegramId}/${m.roomId}): ${res.error}`);
          continue;
        }
        console.log(`${LOG_PREFIX.scheduler} removed member ${m.telegramId} from room ${m.roomId} (missed ${streak} days)`);
        const name = repo.getDisplayName(m.telegramId) ?? String(m.telegramId);
        await notify(m.telegramId, t(locale, 'removed_member', { room: room.name }));
        await notify(room.adminId, t(locale, 'removed_admin', { name, room: room.name }));
        continue;
      }
      if (action === 'warn') {
        await notify(m.telegramId, t(locale, 'accountability_warning', { room: room.name }));
        warnedAt = today;
      }
      repo.upsertMembershipState(m.roomId, m.telegramId, lastPrayed, streak, warnedAt);
    } catch (err) {
      console.error(`${LOG_PREFIX.scheduler} accountability step failed (${m.telegramId}/${m.roomId}):`, err);
    }
  }
}
```

- [ ] **Step 3b: Clear state on any leave** — in `src/rooms.ts` `leaveRoom`, after `repo.removeMember(roomId, telegramId);` add:

```ts
  repo.deleteMembershipState(roomId, telegramId);
```

(This covers both voluntary leave and auto-removal — the orchestrator's removal path goes through `leaveRoom`, so the test's "state row cleaned" assertion passes via this line.)

- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/accountability.ts src/rooms.ts tests/accountability.test.ts
git commit -m "feat(stage3): accountability evaluation (warn at 2, remove at 5, injected notify)"
```

---

## Task 5: scheduler daily job + index wiring

**Files:**
- Modify: `src/scheduler.ts`
- Modify: `src/index.ts`
- Test: `tests/scheduler.test.ts`

**Interfaces:**
- Consumes: `evaluateAccountability`, `NotifyFn` from `src/accountability.ts`.
- Produces: `SchedulerDeps` gains `notify: NotifyFn`; `register` returns ≥2 tasks.

- [ ] **Step 1: Update the test** — `tests/scheduler.test.ts` becomes:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from '../src/scheduler.ts';

test('register wires the reminder + accountability jobs and returns stoppable tasks', () => {
  const tasks = register({ send: async () => 1, notify: async () => {} });
  assert.ok(tasks.length >= 2);
  for (const t of tasks) t.stop();
});
```

- [ ] **Step 2: Run** `npm test` → FAIL (`notify` not in `SchedulerDeps`; only 1 task).

- [ ] **Step 3a: Update** `src/scheduler.ts`:

```ts
import cron, { type ScheduledTask } from 'node-cron';
import config from './config.ts';
import { LOG_PREFIX } from './preferences.ts';
import { dispatchDueReminders, type SendFn } from './reminders.ts';
import { evaluateAccountability, type NotifyFn } from './accountability.ts';

export type { SendFn, NotifyFn };

export interface SchedulerDeps { send: SendFn; notify: NotifyFn; }

export function register(deps: SchedulerDeps): ScheduledTask[] {
  const tasks: ScheduledTask[] = [];
  // Every minute: send any due, not-yet-sent reminders (catch-up safe).
  tasks.push(
    cron.schedule('* * * * *', () => {
      dispatchDueReminders(new Date(), config.tz, deps.send).catch((err) => {
        console.error(`${LOG_PREFIX.scheduler} reminder dispatch failed:`, err);
      });
    }, { timezone: config.tz }),
  );
  // Daily 09:00: accountability sweep (warn at 2 missed days, remove at 5).
  tasks.push(
    cron.schedule('0 9 * * *', () => {
      evaluateAccountability(new Date(), config.tz, deps.notify).catch((err) => {
        console.error(`${LOG_PREFIX.scheduler} accountability evaluation failed:`, err);
      });
    }, { timezone: config.tz }),
  );
  console.log(`${LOG_PREFIX.scheduler} reminder dispatch (every minute) + accountability (daily 09:00) scheduled, tz=${config.tz}`);
  return tasks;
}
```

- [ ] **Step 3b: Wire** `src/index.ts` — add the notify closure and boot catch-up (spec §5). After the `send` closure:

```ts
const notify: NotifyFn = async (chatId, text) => {
  await bot.telegram.sendMessage(chatId, text);
};
```

Extend the scheduler import: `import { register as registerSchedules, type SendFn, type NotifyFn } from './scheduler.ts';` and add `import { evaluateAccountability } from './accountability.ts';`

Replace `registerSchedules({ send });` with:

```ts
registerSchedules({ send, notify });
// Catch-up: a redeploy may have crossed the daily 09:00 tick. The sweep is
// wall-clock derived and warn-once guarded, so running it again is safe.
evaluateAccountability(new Date(), config.tz, notify).catch((err) => {
  console.error(`${LOG_PREFIX.scheduler} boot accountability catch-up failed:`, err);
});
```

- [ ] **Step 4: Run** `npm test` → PASS. Also run `npx tsc --noEmit` if `npm test` doesn't already include it (it does — the `test` script starts with typecheck).
- [ ] **Step 5: Commit**

```bash
git add src/scheduler.ts src/index.ts tests/scheduler.test.ts
git commit -m "feat(stage3): daily accountability job + boot catch-up wiring"
```

---

## Task 6: docs — CLAUDE.md, QA checklist, spec resolution

**Files:**
- Modify: `CLAUDE.md` (module map: add `src/accountability.ts` row; update `src/scheduler.ts`, `src/index.ts`, `src/db/connection.ts`, `src/db/repo.ts`, `src/rooms.ts` rows to mention Stage 3)
- Modify: `docs/superpowers/specs/2026-06-16-prayer-rooms-stage3-design.md` (Status → `Resolved & planned`; note under §6 pointing to this plan's "Resolved design decisions")
- Create: `docs/qa/stage3-test-cases.md`

- [ ] **Step 1: Update CLAUDE.md module map.** Add:

```markdown
| `src/accountability.ts` | Stage 3 accountability: pure `computeMissStreak` (wall-clock derived, join-day grace) + `decideAction` (warn at ≥2 missed days once per streak; remove at ≥5 only when the warning is ≥3 days old), and `evaluateAccountability(now, tz, notify)` — daily sweep over plain members of active rooms with an injected `NotifyFn`; removal reuses `rooms.leaveRoom` and DMs both the member and the admin. |
```

and amend the `scheduler.ts` row (daily 09:00 accountability job + notify dep), `index.ts` row (notify closure + boot catch-up), `connection.ts` row (add `membership_state`), `repo.ts` row (membership_state CRUD, `lastPrayedDate`, `listEvaluableMemberships`, `getDisplayName`), `rooms.ts` row (`leaveRoom` clears membership_state).

- [ ] **Step 2: Update the spec status header** to:

```markdown
**Status:** Resolved & planned — §6 decisions resolved in
`docs/superpowers/plans/2026-07-15-prayer-rooms-stage3-accountability.md` (Resolved design decisions).
```

- [ ] **Step 3: Create `docs/qa/stage3-test-cases.md`:**

```markdown
# Stage 3 — Manual QA Test Cases (Accountability)

Best with two Telegram accounts (A = admin, B = member) in one room with topics.
Bot timezone **Europe/Podgorica**; the daily sweep runs at **09:00** (and once on boot).

**Quick-test tip:** streaks derive from `prayer_log` dates and `room_members.joined_at` —
to simulate history, backdate `joined_at` / insert `prayer_log` rows in the DB, then
trigger the sweep by redeploying (boot catch-up) instead of waiting for 09:00.

## Warning
- [ ] **TC-S3-01** B misses 2 full days (no 🙏 in that room) → after the next sweep B gets one warm warning naming the room; A gets nothing.
- [ ] **TC-S3-02** Sweep runs again the same day (redeploy) → no second warning.
- [ ] **TC-S3-03** After the warning, B taps 🙏 → next sweep: no warning, streak reset; a later 2-day miss warns again (fresh cycle).

## Removal
- [ ] **TC-S3-04** B keeps missing: 5 consecutive missed days AND ≥3 days after the warning → B is removed from that room; B and A both receive a DM; B's active personal topics are gone, answered ones remain.
- [ ] **TC-S3-05** B can rejoin with a fresh invite code and gets join-day grace again.
- [ ] **TC-S3-06** A (room admin) never prays → never warned/removed in their own room.
- [ ] **TC-S3-07** A room where removal leaves only the admin is fine (room stays active).

## Grace & multi-room
- [ ] **TC-S3-08** A brand-new member is not warned on their first days (counting starts the day after joining).
- [ ] **TC-S3-09** A user in two rooms who prays only in room 1 is warned/removed only in room 2.

## Catch-up
- [ ] **TC-S3-10** Bot down across 09:00 → on boot the sweep runs once; a member at streak ≥5 who was never warned gets a warning (not silent removal); removal follows ≥3 days later if the silence continues.

## Notes column (fill during QA)
| TC | Pass? | Note / improvement idea |
|----|-------|-------------------------|
|    |       |                         |
```

- [ ] **Step 4: Run** `npm test` → PASS (docs only, still verify).
- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/qa/stage3-test-cases.md docs/superpowers/specs/2026-06-16-prayer-rooms-stage3-design.md
git commit -m "docs: Stage 3 accountability - module map, QA test cases, spec resolution"
```
