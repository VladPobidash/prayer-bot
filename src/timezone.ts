import * as repo from './db/repo.ts';
import { localDate, localTime } from './assignments.ts';
import { FALLBACK_TIMEZONE } from './preferences.ts';

// Every day boundary in the product — "today" for assignments, prayers,
// streaks and accountability — is resolved in the user's own timezone. The
// zone is reported by the Mini App (Intl.DateTimeFormat().resolvedOptions())
// and stored on users.timezone; there is no server-wide TZ setting.

const cache = new Map<string, boolean>();

export function isValidTimezone(tz: string): boolean {
  const cached = cache.get(tz);
  if (cached !== undefined) return cached;
  let ok = true;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
  } catch {
    ok = false;
  }
  cache.set(tz, ok);
  return ok;
}

/** The user's IANA zone, or the fallback when it is unknown or no longer valid. */
export function userTimezone(telegramId: number): string {
  const stored = repo.getUserPrefs(telegramId)?.timezone;
  return stored && isValidTimezone(stored) ? stored : FALLBACK_TIMEZONE;
}

/** 'YYYY-MM-DD' — the current local day for this user. */
export function userToday(telegramId: number, now: Date = new Date()): string {
  return localDate(now, userTimezone(telegramId));
}

/** 'HH:MM' — the current local wall-clock time for this user. */
export function userNowHHMM(telegramId: number, now: Date = new Date()): string {
  return localTime(now, userTimezone(telegramId));
}
