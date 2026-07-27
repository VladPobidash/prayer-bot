import config from './config.ts';
import { initDb, closeDb } from './db/connection.ts';
import { getState, setState } from './db/repo.ts';
import { createBot, configureBotMenu } from './bot.ts';
import { startHealthServer } from './server.ts';
import { register as registerSchedules, type SendFn, type NotifyFn } from './scheduler.ts';
import { evaluateAccountability } from './accountability.ts';
import { prayedKeyboard } from './ui.ts';
import { LOG_PREFIX } from './preferences.ts';

// Last-resort guards so a detached promise (cron/worker) logs instead of crashing.
process.on('unhandledRejection', (err) => {
  console.error('[fatal] unhandled rejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaught exception:', err);
});

// Order is the contract: persistence → client → senders → launch → schedules.
initDb();

const bot = createBot();

const send: SendFn = async (chatId, text, topicId) => {
  const extra = topicId === null ? undefined : prayedKeyboard(topicId, config.defaultLocale);
  const m = await bot.telegram.sendMessage(chatId, text, extra);
  return m.message_id;
};

const notify: NotifyFn = async (chatId, text) => {
  await bot.telegram.sendMessage(chatId, text);
};

const server = startHealthServer(config.port);

bot.launch();
console.log(`${LOG_PREFIX.bot} launched (long polling)`);
configureBotMenu(bot);

reconcileOnBoot();
registerSchedules({ send, notify });
// Catch-up: a redeploy may have crossed the daily 09:00 tick. The sweep is
// wall-clock derived and warn-once guarded, so running it again is safe.
evaluateAccountability(new Date(), notify).catch((err) => {
  console.error(`${LOG_PREFIX.scheduler} boot accountability catch-up failed:`, err);
});

const shutdown = () => {
  console.log('Shutting down…');
  bot.stop('SIGTERM');
  server.close();
  closeDb();
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

// Empty-but-real: records boot time; reminder/streak recovery hooks here later.
function reconcileOnBoot(): void {
  const last = getState('last_processed_at');
  console.log(`${LOG_PREFIX.bot} reconcile-on-boot (last_processed_at=${last ?? 'none'})`);
  setState('last_processed_at', new Date().toISOString());
}
