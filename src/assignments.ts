import type { Topic } from './db/repo.ts';

// 'YYYY-MM-DD' for `now` in the given IANA timezone (en-CA gives ISO-like date).
export function localDate(now: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

// 'HH:MM' (24h) for `now` in the given timezone.
export function localTime(now: Date, tz: string): string {
  const s = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now);
  return s === '24:00' ? '00:00' : s;
}

// Stable integer day index from a 'YYYY-MM-DD' string (days since the unix epoch).
export function dayNumber(dateStr: string): number {
  return Math.floor(Date.parse(`${dateStr}T00:00:00Z`) / 86_400_000);
}

// Today's shared topic: rotate the active shared topics in order. Null if none.
export function sharedTopicOfDay(activeShared: Topic[], dayNum: number): Topic | null {
  if (activeShared.length === 0) return null;
  return activeShared[((dayNum % activeShared.length) + activeShared.length) % activeShared.length];
}

// Due when the current local minute equals the member's reminder time.
export function isReminderDue(reminderTime: string, now: Date, tz: string): boolean {
  return localTime(now, tz) === reminderTime;
}
