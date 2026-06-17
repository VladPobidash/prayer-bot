import type { Topic } from './db/repo.ts';
import * as repo from './db/repo.ts';

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

// Assign each member one OTHER member's personal topic, rotated by day.
// Returns member id → topic id (or null when no eligible topic exists).
// Coverage: over a full cycle of days, every topic is prayed for by someone.
export function assignPersonalTopics(
  memberIds: number[], topics: { id: number; ownerId: number }[], dayNum: number,
): Map<number, number | null> {
  const result = new Map<number, number | null>();
  const m = topics.length;
  memberIds.forEach((member, i) => {
    if (m === 0) { result.set(member, null); return; }
    for (let k = 0; k < m; k++) {
      const idx = (((i + dayNum + k) % m) + m) % m;
      const candidate = topics[idx];
      if (candidate.ownerId !== member) { result.set(member, candidate.id); return; }
    }
    result.set(member, null); // every topic belongs to this member
  });
  return result;
}

// Precompute one room's assignments for a date (idempotent via upsert).
export function generateDailyAssignments(roomId: number, date: string): void {
  const day = dayNumber(date);
  const shared = sharedTopicOfDay(repo.listActiveTopics(roomId, 'shared'), day);
  const members = repo.listMembers(roomId).map((m) => m.telegramId);
  const personalTopics = repo.listActiveTopics(roomId, 'personal').map((t) => ({ id: t.id, ownerId: t.ownerId }));
  const personalByMember = assignPersonalTopics(members, personalTopics, day);
  for (const member of members) {
    repo.upsertAssignment(date, roomId, member, shared ? shared.id : null, personalByMember.get(member) ?? null);
  }
}

// Thin wrapper so the bot layer records prayers through the domain module.
export function recordPrayer(telegramId: number, roomId: number, topicId: number, date: string): void {
  repo.recordPrayer(telegramId, roomId, topicId, date);
}
