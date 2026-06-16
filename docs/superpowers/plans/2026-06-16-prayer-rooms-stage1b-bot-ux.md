# Prayer Rooms — Stage 1b (Bot UX Layer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the prayer-room domain (`src/rooms.ts`, built in Stage 1a) into a self-documenting Telegram DM bot: a hybrid menu/slash UX with `/start` onboarding + `/help`, create/join/leave/close rooms, add shared/personal topics, post updates, mark answered — all in uk/en/ru.

**Architecture:** Pure presentation (text + inline keyboards, `RoomError`→message mapping) lives in a new `src/ui.ts` (unit-tested). `src/bot.ts` holds thin Telegraf glue: command handlers, one `callback_query` prefix-router, and a per-user in-memory "pending input" session `Map` for multi-step wizards. Authorization is per-room via `rooms.isRoomAdmin/isRoomMember`; the old global allow-list middleware is removed. All user-facing strings come from `src/i18n.ts`.

**Tech Stack:** TypeScript (Node ≥24 type-stripping), Telegraf 4, `src/rooms.ts` + `src/db/repo.ts` (Stage 1a), `node:test`. `npm test` (= `tsc --noEmit` + `node --test`) stays green.

**Conventions:** `.ts` import extensions; erasable-only TS; per-room auth in handlers (no global gate); callback data `namespace:action:id` (≤64 bytes — carry only ids); `safeEditMessageText` for re-renders; one commit per task; never reference any internal/reference app.

**Manual verification:** the bot handlers are integration glue; the product owner will do an end-to-end manual smoke (Task 8 checklist) after the whole plan lands. Automated tests cover the pure `ui.ts` + `i18n` logic.

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `src/i18n.ts` | modify | Add all Stage 1b uk/en/ru strings + `errorKey(RoomError)` map |
| `src/ui.ts` | create | Pure render + keyboard builders + error-text; no Telegraf calls, no DB |
| `src/bot.ts` | rewrite handlers | Sessions, `/start`+`/help`+`/rooms`+`/join`, callback router, per-room auth |
| `tests/ui.test.ts` | create | Unit tests for `ui.ts` + i18n error mapping |

`src/index.ts`, `src/scheduler.ts`, `src/server.ts`, `src/db/*`, `src/rooms.ts` are unchanged.

---

## Task 1: i18n strings (uk/en/ru) + error map

**Files:**
- Modify: `src/i18n.ts`
- Test: `tests/ui.test.ts`

- [ ] **Step 1: Write the failing test** — create `tests/ui.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t } from '../src/i18n.ts';
import { errorKey } from '../src/i18n.ts';

test('i18n: Stage 1b keys exist in all locales', () => {
  for (const loc of ['uk', 'en', 'ru']) {
    assert.ok(t(loc, 'start_welcome').length > 0);
    assert.ok(t(loc, 'help').length > 0);
    assert.ok(t(loc, 'menu_title').length > 0);
    assert.ok(t(loc, 'room_created', { name: 'X', code: 'abc' }).includes('abc'));
  }
});

test('errorKey maps every RoomError to a translatable key', () => {
  const errs = ['room_cap','shared_cap','personal_cap','invite_invalid','invite_closed',
    'already_member','not_member','not_admin','not_owner','room_not_found','topic_not_found'] as const;
  for (const e of errs) {
    const key = errorKey(e);
    assert.ok(t('uk', key).length > 0, `missing uk text for ${key}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `errorKey` not exported / keys missing.

- [ ] **Step 3: Add the strings + `errorKey` to `src/i18n.ts`**

Add these keys to **each** locale object in `LOCALES` (uk, en, ru). Below: uk first (primary), then en, then ru. `{...}` are interpolation vars.

Add to **uk**:
```ts
    start_welcome: 'Вітаю! 🙏 Цей бот допомагає разом тримати щоденну звичку молитви.\n\nЯк це працює:\n1) Створіть кімнату молитви або приєднайтесь за запрошенням.\n2) У кімнаті: адмін додає спільні теми, ви додаєте свої особисті (до 3).\n3) Позначайте тему як «отримала відповідь», коли бачите, як Бог відповів.\n\n(Щоденні нагадування з’являться згодом.)\n\nОберіть дію нижче:',
    help: 'Команди та дії:\n\nДля всіх:\n• Створити кімнату — ви станете її адміном, отримаєте посилання-запрошення.\n• Приєднатися — за посиланням або кодом запрошення.\n• Мої кімнати — перегляд тем і учасників.\n• Додати особисту тему (до 3 у кімнаті).\n• Оновлення / «отримала відповідь» — на ваших темах.\n• Покинути кімнату.\n\nДля адмінів:\n• Додати спільну тему (до 5).\n• Закрити кімнату.\n\nЗавжди доступно: /start (меню), /help (ця довідка), /rooms (мої кімнати).',
    menu_title: 'Головне меню',
    btn_my_rooms: '🏠 Мої кімнати', btn_create_room: '➕ Створити кімнату',
    btn_join_room: '🔑 Приєднатися', btn_help: '❓ Довідка', btn_back: '⬅ Назад',
    create_prompt_name: 'Введіть назву нової кімнати молитви:',
    room_created: 'Кімнату «{name}» створено! 🎉\nЗапросіть інших цим посиланням або кодом:\n{link}\nКод: {code}\nДалі: додайте спільні теми або запросіть людей.',
    join_prompt_code: 'Надішліть код запрошення:',
    joined: 'Ви приєдналися до кімнати «{name}». 🙏\nДалі: додайте свою особисту тему молитви.',
    rooms_empty: 'У вас поки немає кімнат. Створіть або приєднайтесь через меню (/start).',
    rooms_list_title: 'Ваші кімнати:',
    room_header: '🏠 {name}',
    shared_section: 'Спільні теми:', personal_section: 'Ваші особисті теми:',
    others_personal: 'Особистих тем інших учасників: {count}',
    members_line: 'Учасників: {count}',
    no_topics: '(поки немає тем)',
    answered_mark: '✅ {text} — Відповідь: {note}',
    active_mark: '• {text}',
    btn_add_shared: '➕ Спільна тема', btn_add_personal: '➕ Моя тема',
    btn_close_room: '🔒 Закрити кімнату', btn_leave_room: '🚪 Покинути кімнату',
    btn_update: '📝 Оновлення', btn_answer: '✅ Отримала відповідь',
    shared_prompt: 'Текст спільної теми:', personal_prompt: 'Текст вашої особистої теми:',
    topic_added: 'Тему додано. 🙏',
    pick_topic_update: 'Оберіть тему для оновлення:',
    pick_topic_answer: 'Оберіть тему, яка отримала відповідь:',
    update_prompt: 'Текст оновлення:', update_posted: 'Оновлення додано.',
    answer_prompt: 'Як ви побачили Божу відповідь?', answered_ok: 'Слава Богу! Тему позначено як відповіджену. 🙌',
    leave_confirm: 'Покинути кімнату «{name}»? Ваші активні особисті теми буде видалено.',
    left_ok: 'Ви покинули кімнату.',
    close_confirm: 'Закрити кімнату «{name}» для всіх?',
    closed_ok: 'Кімнату закрито.',
    close_notify: 'Кімнату «{name}» було закрито адміністратором.',
    btn_yes: '✅ Так', btn_no: '❌ Ні',
    err_room_cap: 'Ви вже у максимальній кількості кімнат (3).',
    err_shared_cap: 'Досягнуто ліміту спільних тем (5).',
    err_personal_cap: 'Досягнуто ліміту особистих тем (3).',
    err_invite_invalid: 'Невірний код запрошення.',
    err_invite_closed: 'Ця кімната закрита.',
    err_already_member: 'Ви вже у цій кімнаті.',
    err_not_member: 'Дія недоступна.',
    err_not_admin: 'Лише адмін кімнати може це зробити.',
    err_not_owner: 'Лише автор теми може це зробити.',
    err_room_not_found: 'Кімнату не знайдено.',
    err_topic_not_found: 'Тему не знайдено.',
    err_generic: 'Сталася помилка. Спробуйте ще раз.',
    stale_button: 'Ця дія більше недоступна.',
```

Add to **en** (same keys; English text):
```ts
    start_welcome: 'Welcome! 🙏 This bot helps a small group keep a daily prayer habit together.\n\nHow it works:\n1) Create a prayer room, or join one with an invite link.\n2) In a room: the admin adds shared topics; you add your own personal topics (up to 3).\n3) Mark a topic “answered” when you see how God responded.\n\n(Daily reminders are coming soon.)\n\nPick an action below:',
    help: 'Commands & actions:\n\nFor everyone:\n• Create a room — you become its admin and get an invite link.\n• Join — via an invite link or code.\n• My rooms — view topics and members.\n• Add a personal topic (up to 3 per room).\n• Update / mark “answered” — on your own topics.\n• Leave a room.\n\nFor admins:\n• Add a shared topic (up to 5).\n• Close the room.\n\nAlways available: /start (menu), /help (this), /rooms (my rooms).',
    menu_title: 'Main menu',
    btn_my_rooms: '🏠 My rooms', btn_create_room: '➕ Create room',
    btn_join_room: '🔑 Join', btn_help: '❓ Help', btn_back: '⬅ Back',
    create_prompt_name: 'Send a name for the new prayer room:',
    room_created: 'Room “{name}” created! 🎉\nInvite others with this link or code:\n{link}\nCode: {code}\nNext: add shared topics or invite people.',
    join_prompt_code: 'Send the invite code:',
    joined: 'You joined “{name}”. 🙏\nNext: add your personal prayer topic.',
    rooms_empty: 'You have no rooms yet. Create or join one from the menu (/start).',
    rooms_list_title: 'Your rooms:',
    room_header: '🏠 {name}',
    shared_section: 'Shared topics:', personal_section: 'Your personal topics:',
    others_personal: 'Other members’ personal topics: {count}',
    members_line: 'Members: {count}',
    no_topics: '(no topics yet)',
    answered_mark: '✅ {text} — Answer: {note}',
    active_mark: '• {text}',
    btn_add_shared: '➕ Shared topic', btn_add_personal: '➕ My topic',
    btn_close_room: '🔒 Close room', btn_leave_room: '🚪 Leave room',
    btn_update: '📝 Update', btn_answer: '✅ Answered',
    shared_prompt: 'Shared topic text:', personal_prompt: 'Your personal topic text:',
    topic_added: 'Topic added. 🙏',
    pick_topic_update: 'Pick a topic to update:',
    pick_topic_answer: 'Pick a topic that was answered:',
    update_prompt: 'Update text:', update_posted: 'Update posted.',
    answer_prompt: 'How did you see God answer?', answered_ok: 'Praise God! Topic marked answered. 🙌',
    leave_confirm: 'Leave room “{name}”? Your active personal topics will be removed.',
    left_ok: 'You left the room.',
    close_confirm: 'Close room “{name}” for everyone?',
    closed_ok: 'Room closed.',
    close_notify: 'Room “{name}” was closed by the admin.',
    btn_yes: '✅ Yes', btn_no: '❌ No',
    err_room_cap: 'You are already in the maximum number of rooms (3).',
    err_shared_cap: 'Shared-topic limit reached (5).',
    err_personal_cap: 'Personal-topic limit reached (3).',
    err_invite_invalid: 'Invalid invite code.',
    err_invite_closed: 'This room is closed.',
    err_already_member: 'You are already in this room.',
    err_not_member: 'That action isn’t available.',
    err_not_admin: 'Only the room admin can do that.',
    err_not_owner: 'Only the topic owner can do that.',
    err_room_not_found: 'Room not found.',
    err_topic_not_found: 'Topic not found.',
    err_generic: 'Something went wrong. Please try again.',
    stale_button: 'That action is no longer available.',
```

Add to **ru** (same keys; Russian text):
```ts
    start_welcome: 'Здравствуйте! 🙏 Этот бот помогает небольшой группе вместе держать ежедневную привычку молитвы.\n\nКак это работает:\n1) Создайте молитвенную комнату или присоединитесь по приглашению.\n2) В комнате: админ добавляет общие темы, вы — свои личные (до 3).\n3) Отмечайте тему «получен ответ», когда видите, как Бог ответил.\n\n(Ежедневные напоминания появятся позже.)\n\nВыберите действие ниже:',
    help: 'Команды и действия:\n\nДля всех:\n• Создать комнату — вы станете её админом и получите ссылку-приглашение.\n• Присоединиться — по ссылке или коду.\n• Мои комнаты — темы и участники.\n• Добавить личную тему (до 3 в комнате).\n• Обновление / «получен ответ» — на ваших темах.\n• Покинуть комнату.\n\nДля админов:\n• Добавить общую тему (до 5).\n• Закрыть комнату.\n\nВсегда доступно: /start (меню), /help (справка), /rooms (мои комнаты).',
    menu_title: 'Главное меню',
    btn_my_rooms: '🏠 Мои комнаты', btn_create_room: '➕ Создать комнату',
    btn_join_room: '🔑 Присоединиться', btn_help: '❓ Справка', btn_back: '⬅ Назад',
    create_prompt_name: 'Введите название новой молитвенной комнаты:',
    room_created: 'Комната «{name}» создана! 🎉\nПригласите других этой ссылкой или кодом:\n{link}\nКод: {code}\nДалее: добавьте общие темы или пригласите людей.',
    join_prompt_code: 'Отправьте код приглашения:',
    joined: 'Вы присоединились к «{name}». 🙏\nДалее: добавьте свою личную тему.',
    rooms_empty: 'У вас пока нет комнат. Создайте или присоединитесь через меню (/start).',
    rooms_list_title: 'Ваши комнаты:',
    room_header: '🏠 {name}',
    shared_section: 'Общие темы:', personal_section: 'Ваши личные темы:',
    others_personal: 'Личных тем других участников: {count}',
    members_line: 'Участников: {count}',
    no_topics: '(пока нет тем)',
    answered_mark: '✅ {text} — Ответ: {note}',
    active_mark: '• {text}',
    btn_add_shared: '➕ Общая тема', btn_add_personal: '➕ Моя тема',
    btn_close_room: '🔒 Закрыть комнату', btn_leave_room: '🚪 Покинуть комнату',
    btn_update: '📝 Обновление', btn_answer: '✅ Получен ответ',
    shared_prompt: 'Текст общей темы:', personal_prompt: 'Текст вашей личной темы:',
    topic_added: 'Тема добавлена. 🙏',
    pick_topic_update: 'Выберите тему для обновления:',
    pick_topic_answer: 'Выберите тему, на которую получен ответ:',
    update_prompt: 'Текст обновления:', update_posted: 'Обновление добавлено.',
    answer_prompt: 'Как вы увидели Божий ответ?', answered_ok: 'Слава Богу! Тема отмечена. 🙌',
    leave_confirm: 'Покинуть комнату «{name}»? Ваши активные личные темы будут удалены.',
    left_ok: 'Вы покинули комнату.',
    close_confirm: 'Закрыть комнату «{name}» для всех?',
    closed_ok: 'Комната закрыта.',
    close_notify: 'Комната «{name}» была закрыта администратором.',
    btn_yes: '✅ Да', btn_no: '❌ Нет',
    err_room_cap: 'Вы уже в максимальном числе комнат (3).',
    err_shared_cap: 'Достигнут лимит общих тем (5).',
    err_personal_cap: 'Достигнут лимит личных тем (3).',
    err_invite_invalid: 'Неверный код приглашения.',
    err_invite_closed: 'Эта комната закрыта.',
    err_already_member: 'Вы уже в этой комнате.',
    err_not_member: 'Действие недоступно.',
    err_not_admin: 'Только админ комнаты может это сделать.',
    err_not_owner: 'Только автор темы может это сделать.',
    err_room_not_found: 'Комната не найдена.',
    err_topic_not_found: 'Тема не найдена.',
    err_generic: 'Что-то пошло не так. Попробуйте ещё раз.',
    stale_button: 'Это действие больше недоступно.',
```

Then add the `errorKey` export (after `resolveLocale`), importing the `RoomError` type:
```ts
import type { RoomError } from './rooms.ts';

export function errorKey(error: RoomError): LocaleKey {
  return `err_${error}` as LocaleKey; // err_room_cap, err_not_admin, ...
}
```
(The `err_*` keys above cover every `RoomError` value.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — i18n + error-map tests green; existing tests stay green.

- [ ] **Step 5: Commit**

```bash
git add src/i18n.ts tests/ui.test.ts
git commit -m "feat(rooms-ux): add uk/en/ru strings + RoomError->key map"
```

---

## Task 2: `ui.ts` — pure render + keyboards

**Files:**
- Create: `src/ui.ts`
- Test: `tests/ui.test.ts` (append)

`ui.ts` is pure: it takes data + locale and returns text strings and Telegraf `Markup` keyboards. No DB, no ctx, no network.

- [ ] **Step 1: Append the failing test**

```ts
import { renderRoomView, errorText, mainMenu, roomsList } from '../src/ui.ts';
import type { Room, Topic, Member } from '../src/db/repo.ts';

const room = (over: Partial<Room> = {}): Room => ({
  id: 1, name: 'Morning', adminId: 1, inviteCode: 'abc', status: 'active',
  createdAt: '', closedAt: null, ...over,
});
const topic = (over: Partial<Topic> = {}): Topic => ({
  id: 1, roomId: 1, ownerId: 2, kind: 'personal', text: 'My exam', status: 'active',
  answerNote: null, createdAt: '', answeredAt: null, ...over,
});

test('errorText returns the localized message for a RoomError', () => {
  assert.equal(errorText('not_admin', 'en'), 'Only the room admin can do that.');
});

test('mainMenu has the four entries', () => {
  const kb = mainMenu('en');
  const flat = JSON.stringify(kb);
  for (const d of ['menu:rooms', 'menu:create', 'menu:join', 'menu:help']) assert.ok(flat.includes(d));
});

test('renderRoomView shows admin buttons only for the admin', () => {
  const topics = [topic({ id: 9, ownerId: 2, kind: 'personal', text: 'Mine' })];
  const members: Member[] = [
    { roomId: 1, telegramId: 1, role: 'admin', joinedAt: '' },
    { roomId: 1, telegramId: 2, role: 'member', joinedAt: '' },
  ];
  const adminView = renderRoomView(room(), topics, members, 1, 'en');
  const memberView = renderRoomView(room(), topics, members, 2, 'en');
  assert.ok(JSON.stringify(adminView.keyboard).includes('room:addshared:1')); // admin only
  assert.ok(JSON.stringify(adminView.keyboard).includes('room:close:1'));
  assert.ok(!JSON.stringify(memberView.keyboard).includes('room:close:1'));   // member: no close
  assert.ok(JSON.stringify(memberView.keyboard).includes('room:leave:1'));    // member: leave
  assert.ok(!JSON.stringify(adminView.keyboard).includes('room:leave:1'));    // admin: no leave
  assert.ok(memberView.text.includes('Morning'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `../src/ui.ts` not found.

- [ ] **Step 3: Create `src/ui.ts`**

```ts
import { Markup } from 'telegraf';
import { t, errorKey } from './i18n.ts';
import { truncate, lines } from './notify.ts';
import type { Room, RoomWithRole, Topic, Member } from './db/repo.ts';
import type { RoomError } from './rooms.ts';

export function errorText(error: RoomError, locale: string): string {
  return t(locale, errorKey(error));
}

export function mainMenu(locale: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(locale, 'btn_my_rooms'), 'menu:rooms')],
    [Markup.button.callback(t(locale, 'btn_create_room'), 'menu:create')],
    [Markup.button.callback(t(locale, 'btn_join_room'), 'menu:join')],
    [Markup.button.callback(t(locale, 'btn_help'), 'menu:help')],
  ]);
}

export function roomsList(rooms: RoomWithRole[], locale: string): { text: string; keyboard: ReturnType<typeof Markup.inlineKeyboard> } {
  if (rooms.length === 0) return { text: t(locale, 'rooms_empty'), keyboard: mainMenu(locale) };
  const text = lines([t(locale, 'rooms_list_title'), '', ...rooms.map((r) => `🏠 ${r.name} (${r.role})`)]);
  const buttons = rooms.map((r) => [Markup.button.callback(`🏠 ${r.name}`.slice(0, 60), `room:open:${r.id}`)]);
  buttons.push([Markup.button.callback(t(locale, 'btn_back'), 'menu:home')]);
  return { text: truncate(text), keyboard: Markup.inlineKeyboard(buttons) };
}

// Renders a room for a specific viewer; admins get admin buttons + no Leave, members get Leave.
export function renderRoomView(
  room: Room, topics: Topic[], members: Member[], viewerId: number, locale: string,
): { text: string; keyboard: ReturnType<typeof Markup.inlineKeyboard> } {
  const isAdmin = room.adminId === viewerId;
  const shared = topics.filter((x) => x.kind === 'shared');
  const myPersonal = topics.filter((x) => x.kind === 'personal' && x.ownerId === viewerId);
  const othersPersonal = topics.filter((x) => x.kind === 'personal' && x.ownerId !== viewerId).length;

  const fmt = (x: Topic) => x.status === 'answered'
    ? t(locale, 'answered_mark', { text: x.text, note: x.answerNote ?? '' })
    : t(locale, 'active_mark', { text: x.text });

  const body = lines([
    t(locale, 'room_header', { name: room.name }), '',
    t(locale, 'shared_section'),
    ...(shared.length ? shared.map(fmt) : [t(locale, 'no_topics')]), '',
    t(locale, 'personal_section'),
    ...(myPersonal.length ? myPersonal.map(fmt) : [t(locale, 'no_topics')]), '',
    t(locale, 'others_personal', { count: othersPersonal }),
    t(locale, 'members_line', { count: members.length }),
  ]);

  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  rows.push([Markup.button.callback(t(locale, 'btn_add_personal'), `room:addpersonal:${room.id}`)]);
  if (isAdmin) rows.push([Markup.button.callback(t(locale, 'btn_add_shared'), `room:addshared:${room.id}`)]);
  rows.push([
    Markup.button.callback(t(locale, 'btn_update'), `room:update:${room.id}`),
    Markup.button.callback(t(locale, 'btn_answer'), `room:answer:${room.id}`),
  ]);
  rows.push(isAdmin
    ? [Markup.button.callback(t(locale, 'btn_close_room'), `room:close:${room.id}`)]
    : [Markup.button.callback(t(locale, 'btn_leave_room'), `room:leave:${room.id}`)]);
  rows.push([Markup.button.callback(t(locale, 'btn_back'), 'menu:rooms')]);

  return { text: truncate(body), keyboard: Markup.inlineKeyboard(rows) };
}

export function confirmKb(yesData: string, noData: string, locale: string) {
  return Markup.inlineKeyboard([[
    Markup.button.callback(t(locale, 'btn_yes'), yesData),
    Markup.button.callback(t(locale, 'btn_no'), noData),
  ]]);
}

// A keyboard of the viewer's own active topics, for "update"/"answer" pickers.
export function ownTopicsKb(topics: Topic[], viewerId: number, action: 'update' | 'answer', locale: string) {
  const mine = topics.filter((x) => x.ownerId === viewerId && x.status === 'active');
  const rows = mine.map((x) => [Markup.button.callback(x.text.slice(0, 60), `topic:${action}:${x.id}`)]);
  rows.push([Markup.button.callback(t(locale, 'btn_back'), 'menu:rooms')]);
  return Markup.inlineKeyboard(rows);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui.ts tests/ui.test.ts
git commit -m "feat(rooms-ux): pure ui.ts (render, keyboards, error text) + tests"
```

---

## Task 3: `bot.ts` — sessions, /start, /help, router skeleton

**Files:**
- Modify: `src/bot.ts` (replace the stub command handlers; keep `createBot()` factory + `safeEditMessageText` + `bot.catch`)

This task rewires the bot shell: a pending-input session map, `/start` (with deep-link join), `/help`, `/rooms`, `/join`, the main-menu callbacks, and the `callback_query` router that later tasks extend. **Remove** the global admin-gate `bot.use` middleware.

- [ ] **Step 1: Replace the body of `createBot()` in `src/bot.ts`**

Keep the imports for `Telegraf, type Context`, `config`, `LOG_PREFIX`, and add the new ones. Replace the middleware + `/start /help /ping` + callback stub with:

```ts
import { Telegraf, type Context } from 'telegraf';
import config from './config.ts';
import { LOG_PREFIX } from './preferences.ts';
import { t, resolveLocale } from './i18n.ts';
import * as rooms from './rooms.ts';
import * as repo from './db/repo.ts';
import { mainMenu, roomsList, renderRoomView, confirmKb, ownTopicsKb, errorText } from './ui.ts';

// Pending multi-step input, keyed by user id (chat.id === user.id in DMs).
type Pending =
  | { kind: 'create_name' }
  | { kind: 'join_code' }
  | { kind: 'add_shared'; roomId: number }
  | { kind: 'add_personal'; roomId: number }
  | { kind: 'update_text'; topicId: number }
  | { kind: 'answer_note'; topicId: number };
const pending = new Map<number, Pending>();

export function createBot(token: string = config.telegramBotToken): Telegraf {
  const bot = new Telegraf(token);

  const loc = (ctx: Context) => resolveLocale(ctx);
  const uid = (ctx: Context): number => ctx.from?.id ?? 0;

  async function showMenu(ctx: Context) {
    repo.upsertUser(uid(ctx), ctx.from?.first_name ?? null);
    await ctx.reply(t(loc(ctx), 'start_welcome'), mainMenu(loc(ctx)));
  }
  async function showRooms(ctx: Context) {
    const { text, keyboard } = roomsList(repo.listRoomsForUser(uid(ctx)), loc(ctx));
    await ctx.reply(text, keyboard);
  }
  async function openRoom(ctx: Context, roomId: number) {
    const room = repo.getRoom(roomId);
    if (!room || !rooms.isRoomMember(uid(ctx), roomId)) { await ctx.reply(t(loc(ctx), 'stale_button')); return; }
    const view = renderRoomView(room, repo.listTopics(roomId), repo.listMembers(roomId), uid(ctx), loc(ctx));
    await ctx.reply(view.text, view.keyboard);
  }

  bot.command('start', async (ctx) => {
    const payload = (ctx.message.text.split(' ')[1] ?? '').trim();
    repo.upsertUser(uid(ctx), ctx.from?.first_name ?? null);
    if (payload.startsWith('join_')) {
      const res = rooms.joinRoom(uid(ctx), payload.slice('join_'.length));
      if (res.ok) { await ctx.reply(t(loc(ctx), 'joined', { name: res.value.name })); await openRoom(ctx, res.value.id); return; }
      await ctx.reply(errorText(res.error, loc(ctx)));
    }
    await showMenu(ctx);
  });
  bot.command('help', (ctx) => ctx.reply(t(loc(ctx), 'help'), mainMenu(loc(ctx))));
  bot.command('rooms', (ctx) => showRooms(ctx));
  bot.command('join', async (ctx) => {
    const code = ctx.message.text.replace(/^\/join\s*/, '').trim();
    if (!code) { pending.set(uid(ctx), { kind: 'join_code' }); await ctx.reply(t(loc(ctx), 'join_prompt_code')); return; }
    const res = rooms.joinRoom(uid(ctx), code);
    if (res.ok) { await ctx.reply(t(loc(ctx), 'joined', { name: res.value.name })); await openRoom(ctx, res.value.id); }
    else await ctx.reply(errorText(res.error, loc(ctx)));
  });

  // Plain text → consume a pending wizard step (handlers added in later tasks via handleText()).
  bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return;
    await handleText(ctx, pending, { loc, uid, openRoom, showRooms });
  });

  // Single callback router.
  bot.on('callback_query', async (ctx) => {
    const data = (ctx.callbackQuery as { data?: string }).data ?? '';
    await ctx.answerCbQuery();
    const [ns, action, idRaw] = data.split(':');
    const id = Number(idRaw);
    try {
      if (ns === 'menu') {
        if (action === 'home') return void (await showMenu(ctx));
        if (action === 'rooms') return void (await showRooms(ctx));
        if (action === 'help') return void (await ctx.reply(t(loc(ctx), 'help'), mainMenu(loc(ctx))));
        if (action === 'create') { pending.set(uid(ctx), { kind: 'create_name' }); return void (await ctx.reply(t(loc(ctx), 'create_prompt_name'))); }
        if (action === 'join') { pending.set(uid(ctx), { kind: 'join_code' }); return void (await ctx.reply(t(loc(ctx), 'join_prompt_code'))); }
      }
      await handleRoomCallback(ctx, { ns, action, id, pending, loc, uid, openRoom, showRooms });
    } catch (err) {
      console.error(`${LOG_PREFIX.bot} callback error:`, err);
    }
  });

  bot.catch((err) => console.error(`${LOG_PREFIX.bot} handler error:`, err));
  return bot;
}
```

Add module-level stubs that later tasks flesh out (so this task compiles + runs):
```ts
async function handleText(_ctx: Context, _pending: Map<number, Pending>, _helpers: TextHelpers): Promise<void> {
  // Filled in Task 4+ (create_name/join_code/add_shared/add_personal/update_text/answer_note).
}
async function handleRoomCallback(_ctx: Context, _args: RoomCbArgs): Promise<void> {
  // Filled in Task 4+ (room:open/addshared/addpersonal/update/answer/close/leave, topic:update/answer).
}

interface TextHelpers {
  loc: (c: Context) => string; uid: (c: Context) => number;
  openRoom: (c: Context, roomId: number) => Promise<void>; showRooms: (c: Context) => Promise<void>;
}
interface RoomCbArgs extends TextHelpers {
  ns: string; action: string; id: number; pending: Map<number, Pending>;
}
```
> NOTE for the implementer: keep `Pending`, `handleText`, `handleRoomCallback`, `TextHelpers`, `RoomCbArgs` at module scope so Tasks 4–6 extend the two `handle*` functions. The `safeEditMessageText` export stays as-is.

- [ ] **Step 2: Run typecheck + smoke**

Run: `npm test`
Expected: PASS — `tsc --noEmit` clean (stubs satisfy types); the existing `bot.test.ts` (`createBot('123456:FAKE')` returns a Telegraf instance, `safeEditMessageText` swallow/rethrow) still passes. No new behavior test here (handlers are integration-tested manually).

- [ ] **Step 3: Commit**

```bash
git add src/bot.ts
git commit -m "feat(rooms-ux): bot shell — sessions, /start+deep-link, /help, router (per-room auth)"
```

---

## Task 4: Create + join flows (text wizard)

**Files:**
- Modify: `src/bot.ts` (fill `handleText` create/join branches; add `room:open` to `handleRoomCallback`)

- [ ] **Step 1: Implement `handleText` (replace the stub)**

```ts
async function handleText(ctx: Context, pend: Map<number, Pending>, h: TextHelpers): Promise<void> {
  const userId = h.uid(ctx);
  const p = pend.get(userId);
  if (!p) return; // no active wizard — ignore stray text
  pend.delete(userId);
  const text = (ctx.message as { text: string }).text.trim();
  const locale = h.loc(ctx);

  if (p.kind === 'create_name') {
    const res = rooms.createRoom(userId, text);
    if (!res.ok) return void (await ctx.reply(errorText(res.error, locale)));
    const link = `https://t.me/${ctx.botInfo?.username ?? 'bot'}?start=join_${res.value.inviteCode}`;
    await ctx.reply(t(locale, 'room_created', { name: res.value.name, code: res.value.inviteCode, link }));
    return void (await h.openRoom(ctx, res.value.id));
  }
  if (p.kind === 'join_code') {
    const res = rooms.joinRoom(userId, text);
    if (!res.ok) return void (await ctx.reply(errorText(res.error, locale)));
    await ctx.reply(t(locale, 'joined', { name: res.value.name }));
    return void (await h.openRoom(ctx, res.value.id));
  }
  // add_shared / add_personal / update_text / answer_note handled in Tasks 5-6:
  await handleTopicText(ctx, p, locale, h);
}

// Extended in Tasks 5-6.
async function handleTopicText(_ctx: Context, _p: Pending, _locale: string, _h: TextHelpers): Promise<void> {}
```

Add `room:open` handling — replace the `handleRoomCallback` stub:
```ts
async function handleRoomCallback(ctx: Context, a: RoomCbArgs): Promise<void> {
  const userId = a.uid(ctx);
  const locale = a.loc(ctx);
  if (a.ns === 'room' && a.action === 'open') return void (await a.openRoom(ctx, a.id));
  // addshared/addpersonal/update/answer/close/leave + topic:* added in Tasks 5-6.
  await handleRoomCallback2(ctx, a, userId, locale);
}
async function handleRoomCallback2(_ctx: Context, _a: RoomCbArgs, _userId: number, _locale: string): Promise<void> {}
```

- [ ] **Step 2: Run test** — `npm test` → PASS (typecheck clean; existing tests green).

- [ ] **Step 3: Commit**

```bash
git add src/bot.ts
git commit -m "feat(rooms-ux): create-room + join wizards"
```

---

## Task 5: Add shared/personal topic flows

**Files:**
- Modify: `src/bot.ts` (extend `handleRoomCallback2` for addshared/addpersonal; extend `handleTopicText`)

- [ ] **Step 1: Extend `handleRoomCallback2`** (replace the stub)

```ts
async function handleRoomCallback2(ctx: Context, a: RoomCbArgs, userId: number, locale: string): Promise<void> {
  if (a.ns !== 'room') return void (await handleTopicCallback(ctx, a, userId, locale));
  if (a.action === 'addshared') {
    if (!rooms.isRoomAdmin(userId, a.id)) return void (await ctx.reply(errorText('not_admin', locale)));
    a.pending.set(userId, { kind: 'add_shared', roomId: a.id });
    return void (await ctx.reply(t(locale, 'shared_prompt')));
  }
  if (a.action === 'addpersonal') {
    if (!rooms.isRoomMember(userId, a.id)) return void (await ctx.reply(t(locale, 'stale_button')));
    a.pending.set(userId, { kind: 'add_personal', roomId: a.id });
    return void (await ctx.reply(t(locale, 'personal_prompt')));
  }
  await handleRoomCallback3(ctx, a, userId, locale); // update/answer/close/leave — Task 6
}
async function handleRoomCallback3(_ctx: Context, _a: RoomCbArgs, _userId: number, _locale: string): Promise<void> {}
async function handleTopicCallback(_ctx: Context, _a: RoomCbArgs, _userId: number, _locale: string): Promise<void> {}
```

- [ ] **Step 2: Extend `handleTopicText`** (replace the stub) to handle the two topic-add kinds

```ts
async function handleTopicText(ctx: Context, p: Pending, locale: string, h: TextHelpers): Promise<void> {
  const userId = h.uid(ctx);
  const text = (ctx.message as { text: string }).text.trim();
  if (p.kind === 'add_shared') {
    const res = rooms.addSharedTopic(userId, p.roomId, text);
    await ctx.reply(res.ok ? t(locale, 'topic_added') : errorText(res.error, locale));
    return void (await h.openRoom(ctx, p.roomId));
  }
  if (p.kind === 'add_personal') {
    const res = rooms.addPersonalTopic(userId, p.roomId, text);
    await ctx.reply(res.ok ? t(locale, 'topic_added') : errorText(res.error, locale));
    return void (await h.openRoom(ctx, p.roomId));
  }
  await handleTopicText2(ctx, p, locale, h); // update_text/answer_note — Task 6
}
async function handleTopicText2(_ctx: Context, _p: Pending, _locale: string, _h: TextHelpers): Promise<void> {}
```

- [ ] **Step 3: Run test** — `npm test` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/bot.ts
git commit -m "feat(rooms-ux): add shared/personal topic wizards"
```

---

## Task 6: Update, mark-answered, leave, close flows

**Files:**
- Modify: `src/bot.ts` (fill `handleRoomCallback3`, `handleTopicCallback`, `handleTopicText2`)

- [ ] **Step 1: Fill `handleRoomCallback3`** (update/answer pickers, close, leave)

```ts
async function handleRoomCallback3(ctx: Context, a: RoomCbArgs, userId: number, locale: string): Promise<void> {
  if (a.action === 'update' || a.action === 'answer') {
    const room = repo.getRoom(a.id);
    if (!room || !rooms.isRoomMember(userId, a.id)) return void (await ctx.reply(t(locale, 'stale_button')));
    const prompt = a.action === 'update' ? 'pick_topic_update' : 'pick_topic_answer';
    await ctx.reply(t(locale, prompt), ownTopicsKb(repo.listTopics(a.id), userId, a.action, locale));
    return;
  }
  if (a.action === 'close') {
    const room = repo.getRoom(a.id);
    if (!room) return void (await ctx.reply(t(locale, 'stale_button')));
    await ctx.reply(t(locale, 'close_confirm', { name: room.name }), confirmKb(`do:close:${a.id}`, 'menu:rooms', locale));
    return;
  }
  if (a.action === 'leave') {
    const room = repo.getRoom(a.id);
    if (!room) return void (await ctx.reply(t(locale, 'stale_button')));
    await ctx.reply(t(locale, 'leave_confirm', { name: room.name }), confirmKb(`do:leave:${a.id}`, 'menu:rooms', locale));
    return;
  }
  if (a.ns === 'do' && a.action === 'close') {
    const res = rooms.closeRoom(userId, a.id);
    if (!res.ok) return void (await ctx.reply(errorText(res.error, locale)));
    // notify other members
    for (const m of repo.listMembers(a.id)) {
      if (m.telegramId !== userId) {
        try { await ctx.telegram.sendMessage(m.telegramId, t(locale, 'close_notify', { name: res.value.name })); } catch { /* member blocked the bot */ }
      }
    }
    return void (await ctx.reply(t(locale, 'closed_ok')));
  }
  if (a.ns === 'do' && a.action === 'leave') {
    const res = rooms.leaveRoom(userId, a.id);
    await ctx.reply(res.ok ? t(locale, 'left_ok') : errorText(res.error, locale));
    return void (await a.showRooms(ctx));
  }
}
```
> The router splits `do:close:<id>` / `do:leave:<id>` to `ns='do'`. Ensure the top-level router passes `do:*` into `handleRoomCallback` (it already does — `handleRoomCallback` → `handleRoomCallback2` → `handleRoomCallback3`; add an early pass-through for `ns==='do'` in `handleRoomCallback`: see Step 2).

- [ ] **Step 2: Route `do:*` callbacks** — in `handleRoomCallback` (Task 4), change the guard so `do:*` reaches `handleRoomCallback3`. Replace its body with:

```ts
async function handleRoomCallback(ctx: Context, a: RoomCbArgs): Promise<void> {
  if (a.ns === 'room' && a.action === 'open') return void (await a.openRoom(ctx, a.id));
  if (a.ns === 'topic') return void (await handleTopicCallback(ctx, a, a.uid(ctx), a.loc(ctx)));
  if (a.ns === 'do') return void (await handleRoomCallback3(ctx, a, a.uid(ctx), a.loc(ctx)));
  await handleRoomCallback2(ctx, a, a.uid(ctx), a.loc(ctx));
}
```

- [ ] **Step 3: Fill `handleTopicCallback`** (a topic was picked for update/answer → prompt for text)

```ts
async function handleTopicCallback(ctx: Context, a: RoomCbArgs, userId: number, locale: string): Promise<void> {
  const topic = repo.getTopic(a.id);
  if (!topic || topic.ownerId !== userId) return void (await ctx.reply(errorText('not_owner', locale)));
  if (a.action === 'update') { a.pending.set(userId, { kind: 'update_text', topicId: a.id }); return void (await ctx.reply(t(locale, 'update_prompt'))); }
  if (a.action === 'answer') { a.pending.set(userId, { kind: 'answer_note', topicId: a.id }); return void (await ctx.reply(t(locale, 'answer_prompt'))); }
}
```

- [ ] **Step 4: Fill `handleTopicText2`** (the update/answer note text)

```ts
async function handleTopicText2(ctx: Context, p: Pending, locale: string, h: TextHelpers): Promise<void> {
  const userId = h.uid(ctx);
  const text = (ctx.message as { text: string }).text.trim();
  if (p.kind === 'update_text') {
    const res = rooms.postUpdate(userId, p.topicId, text);
    await ctx.reply(res.ok ? t(locale, 'update_posted') : errorText(res.error, locale));
    const topic = repo.getTopic(p.topicId);
    if (topic) await h.openRoom(ctx, topic.roomId);
    return;
  }
  if (p.kind === 'answer_note') {
    const res = rooms.markAnswered(userId, p.topicId, text);
    await ctx.reply(res.ok ? t(locale, 'answered_ok') : errorText(res.error, locale));
    const topic = repo.getTopic(p.topicId);
    if (topic) await h.openRoom(ctx, topic.roomId);
    return;
  }
}
```

- [ ] **Step 5: Run test** — `npm test` → PASS (typecheck clean; existing tests green).

- [ ] **Step 6: Commit**

```bash
git add src/bot.ts
git commit -m "feat(rooms-ux): update, mark-answered, leave, close flows"
```

---

## Task 7: Docs update

**Files:**
- Modify: `CLAUDE.md`, `docs/USAGE.md`, `docs/architecture-decisions.md`

- [ ] **Step 1: Update the docs** (no code; keep accurate to the implementation)
  - `CLAUDE.md`: add `src/rooms.ts` and `src/ui.ts` to the module map; update the `bot.ts` line (menu + room/topic handlers + session map + per-room auth, **no global gate**); note the new `i18n` keys. Update the Patterns section: "per-room authorization (not a global allow-list)", "pending-input session Map for wizards".
  - `docs/USAGE.md`: replace the `/start /help /ping` table with the real flow — `/start` (menu + how-it-works), `/help`, `/rooms`, `/join <code>`, and the button-driven actions (create/join/leave/close rooms; add shared/personal topics; post update; mark answered). Note uk/en/ru.
  - `docs/architecture-decisions.md`: add ADR "Logical DM rooms joined by invite code (no Telegram groups)" and ADR "Per-room authorization replaces the global allow-list" and ADR "Self-documenting bot (/start instructions + /help reference)".

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md docs/USAGE.md docs/architecture-decisions.md
git commit -m "docs: update for prayer-room bot UX (rooms, topics, per-room auth)"
```

---

## Task 8: Final verification + manual smoke checklist

**Files:** none — verification

- [ ] **Step 1: Full suite** — `npm test` → all pass (template + i18n + ui tests), `tsc --noEmit` clean.
- [ ] **Step 2: Leak check** — confirm no internal/reference-app terms in `src/` or docs; every local import uses `.ts`.
- [ ] **Step 3: Local boot smoke (product owner)** — with a real token in `.env`, `npm start`, then in Telegram DM:
  - `/start` → welcome + how-it-works + menu buttons appear.
  - Create Room → name → get invite link; room view shows (admin buttons incl. Add shared / Close).
  - From a *second* Telegram account, open the invite link (`?start=join_...`) → joins → room view (member buttons incl. Add personal / Leave, **no** Close).
  - Add a shared topic (admin) and a personal topic (member); both appear; caps enforced (6th shared / 4th personal refused).
  - Post an update and mark a topic answered ("how God answered") → answered topic shows with its note.
  - Leave (member) → personal topics gone; Close (admin) → other member gets the close DM.
  - `/help` lists every step.
- [ ] **Step 4: Commit any fixes from smoke**, then this stage is ready to merge + deploy.

---

## Self-Review (completed by plan author)

**Spec coverage (Stage 1 spec §5 onboarding, §7 flows — UX parts):** self-documenting `/start`+`/help` → Tasks 1,3; menu/hybrid UX → Tasks 2,3; deep-link + code join → Tasks 3,4; create/my-rooms/room-view → Tasks 2,3,4; add shared/personal (caps via rooms.ts) → Task 5; update/answered → Task 6; leave/close (+member notify) → Task 6; per-room auth (no global gate) → Task 3 + handler checks; uk/en/ru → Task 1; docs/ADRs → Task 7; manual smoke → Task 8.

**Placeholder scan:** the `handleText`/`handleRoomCallback*`/`handleTopicCallback`/`handleTopic*` stubs introduced in Task 3 are **progressively replaced with complete code in Tasks 4–6** (each shows the full function body); no stub survives past Task 6. All i18n values are concrete in all three locales. No "add error handling"-style vagueness — every error path maps through `errorText`.

**Type consistency:** `Pending` union + `TextHelpers`/`RoomCbArgs` interfaces defined in Task 3 and used unchanged in 4–6; callback-data strings are consistent (`menu:home|rooms|help|create|join`, `room:open|addshared|addpersonal|update|answer|close|leave:<id>`, `topic:update|answer:<id>`, `do:close|leave:<id>`) across `ui.ts` producers (Task 2) and `bot.ts` consumers (Tasks 3–6); `rooms.ts` API names (`createRoom`/`joinRoom`/`addSharedTopic`/`addPersonalTopic`/`postUpdate`/`markAnswered`/`leaveRoom`/`closeRoom`/`isRoomAdmin`/`isRoomMember`) and `RoomError` match Stage 1a exactly; `errorKey`/`errorText` consistent across i18n.ts (Task 1), ui.ts (Task 2), bot.ts (Tasks 3–6).
