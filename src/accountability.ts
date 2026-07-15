import * as repo from './db/repo.ts';
import * as rooms from './rooms.ts';
import { localDate, dayNumber } from './assignments.ts';
import { t } from './i18n.ts';
import config from './config.ts';
import { LOG_PREFIX } from './preferences.ts';

// Consecutive fully-missed local days ending yesterday. The join day never
// counts (grace), and any prayer moves the anchor forward — so the streak
// resets automatically and is safe to recompute after missed ticks.
export function computeMissStreak(lastPrayedDate: string | null, joinDate: string, today: string): number {
  const anchor = lastPrayedDate && lastPrayedDate > joinDate ? lastPrayedDate : joinDate;
  return Math.max(0, dayNumber(today) - 1 - dayNumber(anchor));
}

export type AccountabilityAction = 'none' | 'warn' | 'remove';

// Warn once per streak at >=2 missed days; remove at >=5 only when the warning
// is >=3 days old, so a warning always precedes removal even after downtime.
export function decideAction(streak: number, warnedAt: string | null, today: string): AccountabilityAction {
  if (streak >= 5 && warnedAt !== null && dayNumber(today) - dayNumber(warnedAt) >= 3) return 'remove';
  if (streak >= 2 && warnedAt === null) return 'warn';
  return 'none';
}

export type NotifyFn = (chatId: number, text: string) => Promise<void>;

// Daily sweep: recompute each plain member's miss-streak from prayer_log
// (wall-clock derived — idempotent + catch-up safe), warn at 2, remove at 5.
export async function evaluateAccountability(now: Date, tz: string, notify: NotifyFn): Promise<void> {
  const today = localDate(now, tz);
  const locale = config.defaultLocale;
  for (const m of repo.listEvaluableMemberships()) {
    const room = repo.getRoom(m.roomId);
    if (!room) continue;
    const lastPrayed = repo.lastPrayedDate(m.telegramId, m.roomId);
    const streak = computeMissStreak(lastPrayed, m.joinedAt.slice(0, 10), today);
    // a prayer on/after the warning date (or a streak below 2) makes the warning stale
    let warnedAt = repo.getMembershipState(m.roomId, m.telegramId)?.warnedAt ?? null;
    if (warnedAt && ((lastPrayed && lastPrayed >= warnedAt) || streak < 2)) warnedAt = null;
    try {
      const action = decideAction(streak, warnedAt, today);
      if (action === 'remove') {
        const res = rooms.leaveRoom(m.telegramId, m.roomId);
        if (!res.ok) {
          console.error(`${LOG_PREFIX.scheduler} auto-remove failed (${m.telegramId}/${m.roomId}): ${res.error}`);
          continue;
        }
        console.log(`${LOG_PREFIX.scheduler} removed member ${m.telegramId} from room ${m.roomId} (missed ${streak} days)`);
        const name = repo.getDisplayName(m.telegramId) ?? String(m.telegramId);
        await notify(m.telegramId, t(locale, 'removed_member', { room: room.name }));
        await notify(room.adminId, t(locale, 'removed_admin', { name, room: room.name }));
        continue;
      }
      if (action === 'warn') {
        await notify(m.telegramId, t(locale, 'accountability_warning', { room: room.name }));
        warnedAt = today;
      }
      repo.upsertMembershipState(m.roomId, m.telegramId, lastPrayed, streak, warnedAt);
    } catch (err) {
      console.error(`${LOG_PREFIX.scheduler} accountability step failed (${m.telegramId}/${m.roomId}):`, err);
    }
  }
}
