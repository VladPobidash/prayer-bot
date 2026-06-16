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

interface TextHelpers {
  loc: (c: Context) => string; uid: (c: Context) => number;
  openRoom: (c: Context, roomId: number) => Promise<void>; showRooms: (c: Context) => Promise<void>;
}
interface RoomCbArgs extends TextHelpers {
  ns: string; action: string; id: number; pending: Map<number, Pending>;
}

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
    const payload = ((ctx.message as { text: string }).text.split(' ')[1] ?? '').trim();
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
    const code = (ctx.message as { text: string }).text.replace(/^\/join\s*/, '').trim();
    if (!code) { pending.set(uid(ctx), { kind: 'join_code' }); await ctx.reply(t(loc(ctx), 'join_prompt_code')); return; }
    const res = rooms.joinRoom(uid(ctx), code);
    if (res.ok) { await ctx.reply(t(loc(ctx), 'joined', { name: res.value.name })); await openRoom(ctx, res.value.id); }
    else await ctx.reply(errorText(res.error, loc(ctx)));
  });

  // Plain text → consume a pending wizard step.
  bot.on('text', async (ctx) => {
    if ((ctx.message as { text: string }).text.startsWith('/')) return;
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
    const link = `https://t.me/${(ctx.botInfo as { username?: string } | undefined)?.username ?? 'bot'}?start=join_${res.value.inviteCode}`;
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

async function handleRoomCallback(ctx: Context, a: RoomCbArgs): Promise<void> {
  if (a.ns === 'room' && a.action === 'open') return void (await a.openRoom(ctx, a.id));
  // addshared/addpersonal/update/answer/close/leave + topic:* added in Tasks 5-6.
  await handleRoomCallback2(ctx, a, a.uid(ctx), a.loc(ctx));
}

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

export async function safeEditMessageText(
  ctx: Context,
  text: string,
  extra?: Parameters<Context['editMessageText']>[1],
): Promise<void> {
  try {
    await ctx.editMessageText(text, extra);
  } catch (err) {
    const e = err as { description?: string; message?: string };
    const msg = e.description ?? e.message ?? '';
    if (!/message is not modified/i.test(msg)) throw err;
  }
}
