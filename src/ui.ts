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
