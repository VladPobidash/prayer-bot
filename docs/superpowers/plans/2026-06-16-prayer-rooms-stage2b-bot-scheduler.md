# Prayer Rooms — Stage 2b (Reminders, Confirmation, Scheduler) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make Stage 2 live — at each member's daily reminder time, the bot sends one message per assigned topic (🙏 Prayed-today button); tapping records the prayer; replying with voice/video forwards it to the topic owner (named); and members set their reminder time from the menu. Built on Stage 2a's `assignments.ts` + repo.

**Architecture:** A new `src/reminders.ts` orchestrates dispatch with an **injected `send`** (so it's testable with a stub + in-memory DB). A `sent_assignment` table tracks each sent per-topic message — it powers both **dispatch idempotency / catch-up** ("already sent today?") and **voice-reply mapping** (reply message_id → topic → owner). The scheduler runs a **per-minute** job calling `dispatchDueReminders`; "due" = local time ≥ reminder time AND not-yet-sent today (so a missed minute/redeploy catches up). Single bot timezone (`config.tz`).

**Tech Stack:** TypeScript (Node ≥24), Telegraf 4 (callback + media handlers), node-cron (per-minute), better-sqlite3, `node:test`. Stage 2a (`assignments.ts`, repo, schema) is in place.

**Conventions:** `.ts` imports; erasable-only TS; all SQL in connection.ts/repo.ts; callback data `namespace:action:id`; `npm test` green; one commit per task; never reference any internal/reference app. Pure/orchestration logic injects `send`/`now` for tests; the Telegraf glue (scheduler tick, media handler) is manually smoke-tested.

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `src/db/connection.ts` | modify | new `sent_assignment` table |
| `src/db/repo.ts` | modify | `recordSent`/`getSentByMessage`/`hasSentToday`/`listActiveRoomsForUser` |
| `src/i18n.ts` | modify | reminder + confirmation + reminder-time uk/en/ru strings |
| `src/ui.ts` | modify | `prayedKeyboard`, reminder button on the main menu |
| `src/reminders.ts` | create | `buildMessagesForUser`, `dispatchDueReminders(now, send)` — injected send |
| `src/scheduler.ts` | modify | per-minute reminder job (replaces heartbeat); takes a `send` dep |
| `src/bot.ts` | modify | prayed-button callback, voice/video reply handler, reminder-time wizard + menu button |
| `src/index.ts` | modify | build the real `send` closure (returns message_id + prayed keyboard); wire scheduler |
| `tests/reminders.test.ts` | create | dispatch logic with a stub send + in-memory DB |
| `tests/ui.test.ts` | modify | prayedKeyboard test |
| `tests/rooms-repo.test.ts` | modify | sent_assignment repo test |

---

## Task 1: `sent_assignment` schema + repo

**Files:** modify `src/db/connection.ts`, `src/db/repo.ts`; append `tests/rooms-repo.test.ts`

- [ ] **Step 1: Append the failing test** to `tests/rooms-repo.test.ts`

```ts
import { recordSent, getSentByMessage, hasSentToday, listActiveRoomsForUser } from '../src/db/repo.ts';

test('sent_assignment: record + lookup-by-message + sent-today + active-rooms-for-user', () => {
  initDb(':memory:');
  upsertUser(1, 'A');
  const roomId = insertRoom('Room', 1, 'codesent');
  addMember(roomId, 1, 'admin');
  const topicId = insertTopic(roomId, 1, 'shared', 'church');

  assert.equal(hasSentToday(1, '2026-06-17'), false);
  recordSent(1, 555, topicId, roomId, '2026-06-17');
  assert.equal(hasSentToday(1, '2026-06-17'), true);
  const s = getSentByMessage(1, 555);
  assert.equal(s?.topicId, topicId);
  assert.equal(s?.roomId, roomId);
  assert.equal(getSentByMessage(1, 999), null);
  assert.deepEqual(listActiveRoomsForUser(1).map((r) => r.id), [roomId]);
  closeDb();
});
```

- [ ] **Step 2: Run** `npm test` → FAIL (functions/table missing).

- [ ] **Step 3a: Add the table** in `src/db/connection.ts` `initDb()` (after the Stage 2a tables, before `runMigrations`):

```ts
  db.exec(`
    CREATE TABLE IF NOT EXISTS sent_assignment (
      chat_id    INTEGER NOT NULL,
      message_id INTEGER NOT NULL,
      topic_id   INTEGER NOT NULL,
      room_id    INTEGER NOT NULL,
      sent_date  TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (chat_id, message_id)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sent_chat_date ON sent_assignment(chat_id, sent_date)`);
```

- [ ] **Step 3b: Add repo functions** in `src/db/repo.ts`:

```ts
export interface SentAssignment { chatId: number; messageId: number; topicId: number; roomId: number; sentDate: string; }
export function recordSent(chatId: number, messageId: number, topicId: number, roomId: number, sentDate: string): void {
  getDb().prepare(
    `INSERT OR IGNORE INTO sent_assignment (chat_id, message_id, topic_id, room_id, sent_date) VALUES (?, ?, ?, ?, ?)`,
  ).run(chatId, messageId, topicId, roomId, sentDate);
}
export function getSentByMessage(chatId: number, messageId: number): SentAssignment | null {
  const r = getDb().prepare(
    `SELECT chat_id, message_id, topic_id, room_id, sent_date FROM sent_assignment WHERE chat_id = ? AND message_id = ?`,
  ).get(chatId, messageId) as { chat_id: number; message_id: number; topic_id: number; room_id: number; sent_date: string } | undefined;
  return r ? { chatId: r.chat_id, messageId: r.message_id, topicId: r.topic_id, roomId: r.room_id, sentDate: r.sent_date } : null;
}
export function hasSentToday(chatId: number, date: string): boolean {
  return !!getDb().prepare(`SELECT 1 FROM sent_assignment WHERE chat_id = ? AND sent_date = ? LIMIT 1`).get(chatId, date);
}
export function listActiveRoomsForUser(telegramId: number): Room[] {
  return (getDb().prepare(
    `SELECT r.* FROM rooms r JOIN room_members m ON m.room_id = r.id
     WHERE m.telegram_id = ? AND r.status = 'active' ORDER BY r.id`,
  ).all(telegramId) as RoomRow[]).map(toRoom);
}
```

- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/db/connection.ts src/db/repo.ts tests/rooms-repo.test.ts
git commit -m "feat(stage2): sent_assignment table + repo (dispatch idempotency + reply mapping)"
```

---

## Task 2: i18n strings (uk/en/ru)

**Files:** modify `src/i18n.ts`; append `tests/ui.test.ts`

- [ ] **Step 1: Append the failing test** to `tests/ui.test.ts`

```ts
test('i18n: Stage 2b reminder keys exist in all locales', () => {
  for (const loc of ['uk', 'en', 'ru']) {
    assert.ok(t(loc, 'reminder_shared', { room: 'R', text: 'X' }).includes('X'));
    assert.ok(t(loc, 'btn_prayed').length > 0);
    assert.ok(t(loc, 'prayed_ack').length > 0);
    assert.ok(t(loc, 'confirm_to_owner', { name: 'N', text: 'X' }).includes('N'));
    assert.ok(t(loc, 'reminder_prompt').length > 0);
  }
});
```

- [ ] **Step 2: Run** `npm test` → FAIL.

- [ ] **Step 3: Add keys to each locale in `LOCALES`** (`src/i18n.ts`).

**uk:**
```ts
    reminder_shared: '🙏 Спільна тема — {room}:\n{text}',
    reminder_personal: '🙏 Особиста тема — {room}:\n{text}',
    btn_prayed: '🙏 Помолився сьогодні',
    prayed_ack: 'Дякую! Зараховано на сьогодні. 🙏',
    prayed_already: 'Вже зараховано на сьогодні.',
    confirm_to_owner: '{name} помолився за вашу тему: «{text}» 🙏',
    btn_reminder: '⏰ Час нагадування',
    reminder_prompt: 'Введіть час щоденного нагадування у форматі ГГ:ХХ (напр. 08:00), або «off» щоб вимкнути:',
    reminder_set: 'Нагадування встановлено на {time}. ⏰',
    reminder_off: 'Нагадування вимкнено.',
    reminder_invalid: 'Невірний формат. Введіть ГГ:ХХ (напр. 08:00) або «off».',
```
**en:**
```ts
    reminder_shared: '🙏 Shared topic — {room}:\n{text}',
    reminder_personal: '🙏 Personal topic — {room}:\n{text}',
    btn_prayed: '🙏 Prayed today',
    prayed_ack: 'Thank you! Counted for today. 🙏',
    prayed_already: 'Already counted for today.',
    confirm_to_owner: '{name} prayed for your topic: “{text}” 🙏',
    btn_reminder: '⏰ Reminder time',
    reminder_prompt: 'Send your daily reminder time as HH:MM (e.g. 08:00), or “off” to disable:',
    reminder_set: 'Reminder set for {time}. ⏰',
    reminder_off: 'Reminders disabled.',
    reminder_invalid: 'Invalid format. Send HH:MM (e.g. 08:00) or “off”.',
```
**ru:**
```ts
    reminder_shared: '🙏 Общая тема — {room}:\n{text}',
    reminder_personal: '🙏 Личная тема — {room}:\n{text}',
    btn_prayed: '🙏 Помолился сегодня',
    prayed_ack: 'Спасибо! Засчитано на сегодня. 🙏',
    prayed_already: 'Уже засчитано на сегодня.',
    confirm_to_owner: '{name} помолился за вашу тему: «{text}» 🙏',
    btn_reminder: '⏰ Время напоминания',
    reminder_prompt: 'Отправьте время ежедневного напоминания в формате ЧЧ:ММ (напр. 08:00), или «off» чтобы выключить:',
    reminder_set: 'Напоминание установлено на {time}. ⏰',
    reminder_off: 'Напоминания выключены.',
    reminder_invalid: 'Неверный формат. Отправьте ЧЧ:ММ (напр. 08:00) или «off».',
```

- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/i18n.ts tests/ui.test.ts
git commit -m "feat(stage2): uk/en/ru reminder + confirmation strings"
```

---

## Task 3: `reminders.ts` — dispatch (injected send)

**Files:** create `src/reminders.ts`; create `tests/reminders.test.ts`

- [ ] **Step 1: Write the failing test** — `tests/reminders.test.ts`

```ts
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
```

- [ ] **Step 2: Run** `npm test` → FAIL.

- [ ] **Step 3: Create `src/reminders.ts`**

```ts
import * as repo from './db/repo.ts';
import { localDate, localTime, generateDailyAssignments } from './assignments.ts';
import { t } from './i18n.ts';
import config from './config.ts';

export type SendFn = (chatId: number, text: string, topicId: number) => Promise<number>;

interface OutMsg { topicId: number; roomId: number; text: string; }

// Build today's per-topic messages for a user (shared + personal across rooms), skipping nulls.
export function buildMessagesForUser(telegramId: number, date: string, locale: string): OutMsg[] {
  const out: OutMsg[] = [];
  // ensure each of the user's active rooms has today's assignments (idempotent)
  for (const room of repo.listActiveRoomsForUser(telegramId)) {
    if (!repo.hasAssignmentsForRoomDate(room.id, date)) generateDailyAssignments(room.id, date);
  }
  for (const a of repo.getAssignmentsForUser(telegramId, date)) {
    const room = repo.getRoom(a.roomId);
    if (!room) continue;
    if (a.sharedTopicId != null) {
      const tpc = repo.getTopic(a.sharedTopicId);
      if (tpc && tpc.status === 'active') out.push({ topicId: tpc.id, roomId: room.id, text: t(locale, 'reminder_shared', { room: room.name, text: tpc.text }) });
    }
    if (a.personalTopicId != null) {
      const tpc = repo.getTopic(a.personalTopicId);
      if (tpc && tpc.status === 'active') out.push({ topicId: tpc.id, roomId: room.id, text: t(locale, 'reminder_personal', { room: room.name, text: tpc.text }) });
    }
  }
  return out;
}

// Send due reminders. Due = local time >= reminder_time AND not already sent today.
export async function dispatchDueReminders(now: Date, tz: string, send: SendFn): Promise<void> {
  const date = localDate(now, tz);
  const nowHHMM = localTime(now, tz);
  for (const r of repo.listReminderRecipients()) {
    if (nowHHMM < r.reminderTime) continue;          // not yet their time today
    if (repo.hasSentToday(r.telegramId, date)) continue; // already sent (idempotent + catch-up)
    const msgs = buildMessagesForUser(r.telegramId, date, config.defaultLocale);
    for (const m of msgs) {
      const messageId = await send(r.telegramId, m.text, m.topicId);
      repo.recordSent(r.telegramId, messageId, m.topicId, m.roomId, date);
    }
    // Note: if msgs is empty (all-null assignment), nothing is sent and hasSentToday stays
    // false, so we retry next tick until there's something — acceptable for a daily nudge.
  }
}
```

- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/reminders.ts tests/reminders.test.ts
git commit -m "feat(stage2): reminders dispatch (per-topic, due+idempotent, injected send)"
```

---

## Task 4: `ui.ts` prayed keyboard + menu button

**Files:** modify `src/ui.ts`; append `tests/ui.test.ts`

- [ ] **Step 1: Append the failing test** to `tests/ui.test.ts`

```ts
import { prayedKeyboard } from '../src/ui.ts';
test('prayedKeyboard carries pray:done:<topicId>', () => {
  assert.ok(JSON.stringify(prayedKeyboard(77, 'en')).includes('pray:done:77'));
});
test('mainMenu includes the reminder button', () => {
  assert.ok(JSON.stringify(mainMenu('en')).includes('menu:reminder'));
});
```
(`mainMenu` is already imported in this test file.)

- [ ] **Step 2: Run** `npm test` → FAIL.

- [ ] **Step 3: Edit `src/ui.ts`** — add `prayedKeyboard` and a reminder row to `mainMenu`:

```ts
export function prayedKeyboard(topicId: number, locale: string) {
  return Markup.inlineKeyboard([[Markup.button.callback(t(locale, 'btn_prayed'), `pray:done:${topicId}`)]]);
}
```
In `mainMenu`, add a row before the Help row:
```ts
    [Markup.button.callback(t(locale, 'btn_reminder'), 'menu:reminder')],
```

- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/ui.ts tests/ui.test.ts
git commit -m "feat(stage2): prayed-today keyboard + reminder menu button"
```

---

## Task 5: `bot.ts` — prayed callback, reminder wizard, voice/video confirmation

**Files:** modify `src/bot.ts`

- [ ] **Step 1: Extend the `Pending` union** (add reminder kind) and add the handlers.

Add to the `Pending` type: `| { kind: 'set_reminder' }`.

In the `callback_query` router's `menu` block, add:
```ts
        if (action === 'reminder') { pending.set(uid(ctx), { kind: 'set_reminder' }); return void (await ctx.reply(t(loc(ctx), 'reminder_prompt'))); }
```

Add a `pray` namespace branch in the router (alongside the `menu` / `handleRoomCallback` dispatch):
```ts
      if (ns === 'pray' && action === 'done') {
        const topic = repo.getTopic(id);
        if (!topic) return void (await ctx.reply(t(loc(ctx), 'stale_button')));
        if (repo.hasPrayed(uid(ctx), topic.id, todayLocal())) return void (await ctx.reply(t(loc(ctx), 'prayed_already')));
        repo.recordPrayer(uid(ctx), topic.roomId, topic.id, todayLocal());
        return void (await ctx.reply(t(loc(ctx), 'prayed_ack')));
      }
```
Add the `todayLocal()` helper near the top of `createBot` (or module scope), using `localDate` + `config.tz`:
```ts
  const todayLocal = () => localDate(new Date(), config.tz);
```
Add imports at top of bot.ts: `import { localDate } from './assignments.ts';` and ensure `repo` is imported (it is).

In `handleText`, add the `set_reminder` branch (before the `handleTopicText` fall-through):
```ts
  if (p.kind === 'set_reminder') {
    if (/^off$/i.test(text)) { repo.setReminderEnabled(userId, false); return void (await ctx.reply(t(locale, 'reminder_off'))); }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) return void (await ctx.reply(t(locale, 'reminder_invalid')));
    repo.setReminderTime(userId, text);
    repo.setReminderEnabled(userId, true);
    return void (await ctx.reply(t(locale, 'reminder_set', { time: text }));
  }
```

Add a **voice/video reply handler**. After the `bot.on('text', …)` registration, add:
```ts
  bot.on(['voice', 'video', 'video_note'], async (ctx) => {
    const msg = ctx.message as { reply_to_message?: { message_id: number } };
    const replyTo = msg.reply_to_message?.message_id;
    if (!replyTo) return;
    const sent = repo.getSentByMessage(uid(ctx), replyTo);
    if (!sent) return; // not a reply to an assignment message
    const topic = repo.getTopic(sent.topicId);
    if (!topic) return;
    const ownerId = topic.kind === 'shared' ? (repo.getRoom(topic.roomId)?.adminId ?? null) : topic.ownerId;
    if (!ownerId || ownerId === uid(ctx)) return; // no self-forward
    const prayerName = ctx.from?.first_name ?? 'Someone';
    try {
      await ctx.telegram.copyMessage(ownerId, ctx.chat!.id, ctx.message.message_id, {
        caption: t(loc(ctx), 'confirm_to_owner', { name: prayerName, text: topic.text }),
      });
    } catch (err) { console.error(`${LOG_PREFIX.bot} confirm forward failed:`, err); }
  });
```
> `bot.on(['voice','video','video_note'], …)` uses Telegraf message-type filters. `copyMessage` re-sends the media to the owner with a caption (works for voice/video/video-note; if a caption isn't allowed on a type, the catch logs and skips). Self-forward guarded.

- [ ] **Step 2: Run** `npm test` → `tsc --noEmit` clean + existing tests green (these handlers are integration glue, manually smoke-tested). If `tsc` flags the Telegraf media-filter or `copyMessage` typing, apply a minimal faithful cast and note it.

- [ ] **Step 3: Commit**

```bash
git add src/bot.ts
git commit -m "feat(stage2): prayed-button, reminder-time wizard, voice/video confirmation"
```

---

## Task 6: scheduler + index wiring

**Files:** modify `src/scheduler.ts`, `src/index.ts`

- [ ] **Step 1: Rewrite `src/scheduler.ts`** to run the per-minute reminder job (replacing the heartbeat).

```ts
import cron, { type ScheduledTask } from 'node-cron';
import config from './config.ts';
import { LOG_PREFIX } from './preferences.ts';
import { dispatchDueReminders, type SendFn } from './reminders.ts';

export interface SchedulerDeps { send: SendFn; }

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
  console.log(`${LOG_PREFIX.scheduler} reminder dispatch scheduled (every minute, tz=${config.tz})`);
  return tasks;
}
```
> The `Notify` type / heartbeat are removed. Update `tests/scheduler.test.ts`: `register({ send: async () => 1 })` returns ≥1 stoppable task; stop them. (Replace the old `{ notify }` arg.)

- [ ] **Step 2: Update `tests/scheduler.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from '../src/scheduler.ts';
test('register wires the reminder job and returns stoppable tasks', () => {
  const tasks = register({ send: async () => 1 });
  assert.ok(tasks.length >= 1);
  for (const t of tasks) t.stop();
});
```

- [ ] **Step 3: Wire the real `send` in `src/index.ts`.** Replace the `notify`/`registerSchedules` wiring:

```ts
import { register as registerSchedules, type SendFn } from './scheduler.ts';
import { prayedKeyboard } from './ui.ts';
import config from './config.ts';
// ...
const send: SendFn = async (chatId, text, topicId) => {
  const m = await bot.telegram.sendMessage(chatId, text, prayedKeyboard(topicId, config.defaultLocale));
  return m.message_id;
};
// ... after bot.launch() + reconcileOnBoot():
registerSchedules({ send });
```
Remove the old `Notify`-based `notify` closure (the heartbeat consumer). Keep everything else (process guards, initDb, createBot, health server, launch, reconcileOnBoot, shutdown). `bot.telegram.sendMessage(...)` returns a `Message` with `.message_id`.

- [ ] **Step 4: Run** `npm test` → `tsc --noEmit` clean + tests green (scheduler test updated; reminders/ui/repo tests pass). Clean exit (cron tasks stopped in the test).

- [ ] **Step 5: Commit**

```bash
git add src/scheduler.ts src/index.ts tests/scheduler.test.ts
git commit -m "feat(stage2): per-minute reminder scheduler + index send wiring"
```

---

## Task 7: docs + verification

**Files:** modify `CLAUDE.md`, `docs/USAGE.md`, `docs/architecture-decisions.md`

- [ ] **Step 1: Update docs**
  - `CLAUDE.md`: add `src/reminders.ts` (dispatch, injected send) and `src/assignments.ts` (if not already noted) to the module map; update `src/scheduler.ts` (per-minute reminder dispatch, replaces heartbeat) and `src/bot.ts` (adds `pray:done` callback, voice/video confirmation handler, reminder-time wizard, `menu:reminder`); note the new `sent_assignment` table + Stage 2 columns/tables; update the callback namespaces to include `pray`. Note `index.ts` now injects a `send` (returns message_id) instead of `notify`.
  - `docs/USAGE.md`: add the daily-rhythm section — set your reminder time (⏰), receive one message per assigned topic at that time, tap 🙏 Prayed today, reply with a voice/video note to encourage the topic owner (they see your name). Note single timezone (Europe/Podgorica).
  - `docs/architecture-decisions.md`: append ADRs — "Daily assignments precomputed per room; rotation for coverage"; "Per-minute reminder dispatch, due = time-reached-and-not-sent-today (catch-up safe)"; "sent_assignment table powers idempotency + voice-reply mapping"; "Single bot timezone for Stage 2".
- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md docs/USAGE.md docs/architecture-decisions.md
git commit -m "docs: update for Stage 2 (reminders, confirmation, scheduler)"
```

- [ ] **Step 3: Verify** — `npm test` (all green, tsc clean); grep `src/` + docs for internal/reference-app terms (none); confirm `.ts` imports. Manual smoke is the product owner's (set reminder, receive messages, tap prayed, voice-reply → owner).

---

## Self-Review (completed by plan author)

**Spec coverage (Stage 2 spec §6 mechanics + R1–R6 delivery):** per-topic messages + prayed button (R6) → Tasks 4,5; dispatch due+idempotent+catch-up (R6, review note 1) → Task 3 (`dispatchDueReminders`); generate-on-first-touch keeps shared consistent (R1/R4) → Task 3 (`buildMessagesForUser`); skip all-null (review note 2) → Task 3 (empty msgs → nothing sent); named voice/video confirmation to owner, shared→admin (R5) → Task 5 voice handler; reminder-time UX (R6) → Task 5 wizard + Task 4 menu button; single tz (R3) → `config.tz` throughout; scheduler per-minute → Task 6; data (`sent_assignment`) → Task 1; docs → Task 7.

**Placeholder scan:** complete code in every code step; i18n concrete in all three locales; the only judgement-deferred bits are minimal `tsc` casts for Telegraf media typing (flagged, faithful).

**Type consistency:** `SendFn` defined in `reminders.ts` (Task 3) and imported by `scheduler.ts` (Task 6) + used in `index.ts`; `dispatchDueReminders(now, tz, send)` signature consistent across reminders.ts, scheduler.ts, and the tests; callback data `pray:done:<topicId>` consistent between `ui.prayedKeyboard` (Task 4) and the bot router (Task 5); repo `recordSent`/`getSentByMessage`/`hasSentToday`/`listActiveRoomsForUser` (Task 1) consumed by reminders.ts (Task 3) and bot.ts (Task 5); reuses Stage 2a `localDate`/`localTime`/`generateDailyAssignments`, repo `listReminderRecipients`/`getAssignmentsForUser`/`hasAssignmentsForRoomDate`/`getRoom`/`getTopic`/`recordPrayer`/`hasPrayed`. Note: `scheduler.register` changes from `{ notify }` to `{ send }` — `index.ts` (Task 6) and `tests/scheduler.test.ts` (Task 6) are both updated to match.
