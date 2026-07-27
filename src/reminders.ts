import * as repo from './db/repo.ts';
import { localDate, localTime, generateDailyAssignments } from './assignments.ts';
import { isValidTimezone } from './timezone.ts';
import { getStreakSummary } from './streak.ts';
import { t } from './i18n.ts';
import { FALLBACK_TIMEZONE } from './preferences.ts';
import config from './config.ts';

export type SendFn = (chatId: number, text: string, topicId: number | null) => Promise<number>;

interface OutMsg { topicId: number | null; roomId: number; text: string; }

// Build today's per-topic messages for a user (shared + personal across rooms), skipping nulls.
export function buildMessagesForUser(telegramId: number, date: string, locale: string): OutMsg[] {
  const out: OutMsg[] = [];
  // ensure each of the user's active rooms has today's assignments (idempotent)
  for (const room of repo.listActiveRoomsForUser(telegramId)) {
    if (!repo.hasAssignmentsForRoomDate(room.id, date)) generateDailyAssignments(room.id, date);
  }
  for (const a of repo.getAssignmentsForUser(telegramId, date)) {
    const room = repo.getRoom(a.roomId);
    if (!room) continue;
    if (a.sharedTopicId != null) {
      const tpc = repo.getTopic(a.sharedTopicId);
      if (tpc && tpc.status === 'active') out.push({ topicId: tpc.id, roomId: room.id, text: t(locale, 'reminder_shared', { room: room.name, text: tpc.text }) });
    }
    if (a.personalTopicId != null) {
      const tpc = repo.getTopic(a.personalTopicId);
      if (tpc && tpc.status === 'active') out.push({ topicId: tpc.id, roomId: room.id, text: t(locale, 'reminder_personal', { room: room.name, text: tpc.text }) });
    }
    if (a.sharedTopicId == null && a.personalTopicId == null) {
      out.push({ topicId: null, roomId: room.id, text: t(locale, 'reminder_no_assignment', { room: room.name }) });
    }
  }
  // The streak belongs to the day, not to a topic: it rides on the first
  // message only, so a user with several topics is not told it three times.
  if (out.length > 0) out[0].text += `\n\n${streakLine(telegramId, date, locale)}`;
  return out;
}

// One-line streak footer as of `date` (today's prayers are not in yet at
// reminder time, so this reflects the run the user is about to extend).
export function streakLine(telegramId: number, date: string, locale: string): string {
  const s = getStreakSummary(telegramId, date);
  return s.current > 0 ? t(locale, 'streak_line', { n: s.current }) : t(locale, 'streak_line_start');
}

// Send due reminders. Due = the user's own local time >= their reminder_time
// AND nothing sent yet on their own local day. Both are resolved per user:
// there is no server-wide timezone.
export async function dispatchDueReminders(now: Date, send: SendFn): Promise<void> {
  for (const r of repo.listReminderRecipients()) {
    const tz = r.timezone && isValidTimezone(r.timezone) ? r.timezone : FALLBACK_TIMEZONE;
    const date = localDate(now, tz);
    const nowHHMM = localTime(now, tz);
    if (nowHHMM < r.reminderTime) continue;          // not yet their time today
    if (repo.hasSentToday(r.telegramId, date)) continue; // already sent (idempotent + catch-up)
    const msgs = buildMessagesForUser(r.telegramId, date, config.defaultLocale);
    for (const m of msgs) {
      try {
        const messageId = await send(r.telegramId, m.text, m.topicId);
        // Topic id 0 marks a plain nudge for a room with no assignment. It is
        // deliberately recorded so the per-minute catch-up loop sends it once.
        repo.recordSent(r.telegramId, messageId, m.topicId ?? 0, m.roomId, date);
      } catch (err) {
        console.error(`[scheduler] reminder send failed (topic ${m.topicId}):`, err);
      }
    }
    // A user with no active rooms has no message to send, so the next tick can
    // still catch up if they join a room later today.
  }
}
