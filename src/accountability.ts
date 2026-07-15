import { dayNumber } from './assignments.ts';

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
