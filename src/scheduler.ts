import cron, { type ScheduledTask } from 'node-cron';
import config from './config.ts';
import { LOG_PREFIX } from './preferences.ts';
import { dispatchDueReminders, type SendFn } from './reminders.ts';

export type { SendFn };

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
