import { Telegraf, type Context } from 'telegraf';
import config from './config.ts';
import { LOG_PREFIX } from './preferences.ts';
import { t, resolveLocale } from './i18n.ts';

export function createBot(token: string = config.telegramBotToken): Telegraf {
  const bot = new Telegraf(token);

  // Admin gate: blocks ONLY write/admin commands for non-admins, and does so
  // SILENTLY (never replies "Unauthorized" — that gets a group bot muted/kicked).
  // No write commands exist yet, so isWriteCommand() matches nothing.
  bot.use(async (ctx, next) => {
    if (isWriteCommand(ctx) && !isAdmin(ctx)) return;
    return next();
  });

  bot.command('start', (ctx) => ctx.reply(t(resolveLocale(ctx), 'start')));
  bot.command('help', (ctx) => ctx.reply(t(resolveLocale(ctx), 'help')));
  bot.command('ping', (ctx) => ctx.reply(t(resolveLocale(ctx), 'ping')));

  // Single callback_query router: "namespace:action:id". Carry only a short id;
  // resolve real state server-side (callback_data is capped at 64 bytes).
  bot.on('callback_query', async (ctx) => {
    const data = (ctx.callbackQuery as { data?: string }).data ?? '';
    const [namespace, action, id] = data.split(':');
    await ctx.answerCbQuery();
    switch (`${namespace}:${action}`) {
      case 'demo:noop':
        console.log(`${LOG_PREFIX.bot} demo:noop id=${id}`);
        break;
      default:
        console.log(`${LOG_PREFIX.bot} stale callback: ${data}`);
    }
  });

  bot.catch((err) => {
    console.error(`${LOG_PREFIX.bot} handler error:`, err);
  });

  return bot;
}

// Domain write-commands (e.g. /topic add) return true here so the middleware
// gates them by admin id. Nothing to gate in the skeleton.
function isWriteCommand(_ctx: Context): boolean {
  return false;
}

function isAdmin(ctx: Context): boolean {
  return ctx.from ? config.adminUserIds.has(ctx.from.id) : false;
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
