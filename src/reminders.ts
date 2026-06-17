import * as repo from './db/repo.ts';
import { localDate, localTime, generateDailyAssignments } from './assignments.ts';
import { t } from './i18n.ts';
import config from './config.ts';

export type SendFn = (chatId: number, text: string, topicId: number) => Promise<number>;

interface OutMsg { topicId: number; roomId: number; text: string; }

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
      const messageId = await send(r.telegramId, m.text, m.topicId);
      repo.recordSent(r.telegramId, messageId, m.topicId, m.roomId, date);
    }
    // Note: if msgs is empty (all-null assignment), nothing is sent and hasSentToday stays
    // false, so we retry next tick until there's something — acceptable for a daily nudge.
  }
}
