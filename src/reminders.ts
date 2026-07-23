import * as repo from './db/repo.ts';
import { localDate, localTime, generateDailyAssignments } from './assignments.ts';
import { t } from './i18n.ts';
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
  return out;
}

// Send due reminders. Due = local time >= reminder_time AND not already sent today.
export async function dispatchDueReminders(now: Date, tz: string, send: SendFn): Promise<void> {
  const date = localDate(now, tz);
  const nowHHMM = localTime(now, tz);
  for (const r of repo.listReminderRecipients()) {
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
