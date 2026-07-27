import cron, { type ScheduledTask } from 'node-cron';
import { LOG_PREFIX } from './preferences.ts';
import { dispatchDueReminders, type SendFn } from './reminders.ts';
import { evaluateAccountability, type NotifyFn } from './accountability.ts';

export type { SendFn, NotifyFn };

export interface SchedulerDeps { send: SendFn; notify: NotifyFn; }

// Both jobs run on plain UTC ticks; every day boundary and every reminder
// clock inside them is resolved in the individual user's timezone, so the
// schedule itself does not need one.
export function register(deps: SchedulerDeps): ScheduledTask[] {
  const tasks: ScheduledTask[] = [];
  // Every minute: send any due, not-yet-sent reminders (catch-up safe).
  tasks.push(
    cron.schedule('* * * * *', () => {
      dispatchDueReminders(new Date(), deps.send).catch((err) => {
        console.error(`${LOG_PREFIX.scheduler} reminder dispatch failed:`, err);
      });
    }, { timezone: 'UTC' }),
  );
  // Hourly: accountability sweep (warn at 2 missed days, remove at 5). Hourly
  // rather than once a day because "yesterday" now ends at a different moment
  // for each member; the sweep is idempotent and warn-once guarded.
  tasks.push(
    cron.schedule('0 * * * *', () => {
      evaluateAccountability(new Date(), deps.notify).catch((err) => {
        console.error(`${LOG_PREFIX.scheduler} accountability evaluation failed:`, err);
      });
    }, { timezone: 'UTC' }),
  );
  console.log(`${LOG_PREFIX.scheduler} reminder dispatch (every minute) + accountability (hourly) scheduled; day boundaries are per user`);
  return tasks;
}
