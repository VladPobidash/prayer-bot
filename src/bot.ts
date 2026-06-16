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

async function handleText(_ctx: Context, _pending: Map<number, Pending>, _helpers: TextHelpers): Promise<void> {
  // Filled in Task 4+ (create_name/join_code/add_shared/add_personal/update_text/answer_note).
}
async function handleRoomCallback(_ctx: Context, _args: RoomCbArgs): Promise<void> {
  // Filled in Task 4+ (room:open/addshared/addpersonal/update/answer/close/leave, topic:update/answer).
}

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
