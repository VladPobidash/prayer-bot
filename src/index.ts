import config from './config.ts';
import { initDb, closeDb } from './db/connection.ts';
import { getState, setState } from './db/repo.ts';
import { createBot } from './bot.ts';
import { startHealthServer } from './server.ts';
import { register as registerSchedules, type Notify } from './scheduler.ts';
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

const notify: Notify = (chatId, text, extra) =>
  bot.telegram.sendMessage(
    chatId,
    text,
    extra as Parameters<typeof bot.telegram.sendMessage>[2],
  );

const server = startHealthServer(config.port);

bot.launch();
console.log(`${LOG_PREFIX.bot} launched (long polling)`);

reconcileOnBoot();
registerSchedules({ notify });

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
