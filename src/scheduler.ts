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
