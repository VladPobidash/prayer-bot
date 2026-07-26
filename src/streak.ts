import { dayNumber } from './assignments.ts';
import * as repo from './db/repo.ts';

export interface StreakDay { date: string; prayed: boolean }

export interface StreakSummary {
  current: number;
  best: number;
  prayedToday: boolean;
  lastPrayedDate: string | null;
  week: StreakDay[]; // last 7 local days, oldest first, ending today
}

export const STREAK_WEEK_DAYS = 7;

// Inverse of `dayNumber`: day index since the epoch back to 'YYYY-MM-DD'.
function dateOfDayNumber(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}

// Current streak = consecutive days with at least one recorded prayer, counted
// back from today. A day with no prayer yet does not break it — the streak
// stays alive through today and only ends once yesterday is also missed.
// `best` is the longest such run over the user's whole history.
export function computeStreak(prayedDates: string[], today: string): StreakSummary {
  const days = new Set(prayedDates.map(dayNumber));
  const todayNum = dayNumber(today);
  const prayedToday = days.has(todayNum);

  let current = 0;
  for (let d = prayedToday ? todayNum : todayNum - 1; days.has(d); d--) current++;

  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const d of Array.from(days).sort((a, b) => a - b)) {
    run = prev !== null && d === prev + 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }

  const week: StreakDay[] = [];
  for (let i = STREAK_WEEK_DAYS - 1; i >= 0; i--) {
    const d = todayNum - i;
    week.push({ date: dateOfDayNumber(d), prayed: days.has(d) });
  }

  const last = prev; // Array.from(days).sort() left `prev` at the largest day
  return {
    current,
    best,
    prayedToday,
    lastPrayedDate: last === null ? null : dateOfDayNumber(last),
    week,
  };
}

// DB wrapper: the streak spans every room the user prays in.
export function getStreakSummary(telegramId: number, today: string): StreakSummary {
  return computeStreak(repo.listPrayedDates(telegramId), today);
}
