import cron, { type ScheduledTask } from 'node-cron';
import config from './config.ts';
import { LOG_PREFIX } from './preferences.ts';

export type Notify = (
  chatId: number,
  text: string,
  extra?: unknown,
) => Promise<unknown> | void;

export interface SchedulerDeps {
  notify: Notify;
}

// Each job is feature-flagged and fault-isolated (per-tick try/catch). The
// heartbeat is the worked example; replace/extend with domain jobs later.
export function register(_deps: SchedulerDeps): ScheduledTask[] {
  const tasks: ScheduledTask[] = [];

  if (config.heartbeatCron) {
    tasks.push(
      cron.schedule(
        config.heartbeatCron,
        () => {
          try {
            console.log(`${LOG_PREFIX.scheduler} heartbeat`);
          } catch (err) {
            console.error(`${LOG_PREFIX.scheduler} heartbeat failed:`, err);
          }
        },
        { timezone: config.tz },
      ),
    );
    console.log(`${LOG_PREFIX.scheduler} heartbeat scheduled: ${config.heartbeatCron}`);
  }

  return tasks;
}
