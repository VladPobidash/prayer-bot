import { getDb } from './connection.ts';

export interface BotState {
  key: string;
  value: string;
}

export function getState(key: string): string | null {
  const row = getDb()
    .prepare('SELECT value FROM bot_state WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setState(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO bot_state (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}

// ───────────────────────────────────────────────────────────────────────────
// Prayer-domain repo functions go here (added with the domain). Keep ALL SQL in
// this module so a future Postgres swap touches only connection.ts + repo.ts.
// ───────────────────────────────────────────────────────────────────────────

// ─────────────────────────── Prayer-room domain ───────────────────────────

export type RoomStatus = 'active' | 'closed';
export type MemberRole = 'admin' | 'member';
export type TopicKind = 'shared' | 'personal';
export type TopicStatus = 'active' | 'answered';

export interface Room {
  id: number; name: string; adminId: number; inviteCode: string;
  status: RoomStatus; createdAt: string; closedAt: string | null;
}
export interface RoomWithRole extends Room { role: MemberRole; }
export interface Topic {
  id: number; roomId: number; ownerId: number; kind: TopicKind; text: string;
  status: TopicStatus; answerNote: string | null; createdAt: string; answeredAt: string | null;
  isAnonymous?: boolean;
}

interface RoomRow {
  id: number; name: string; admin_id: number; invite_code: string;
  status: string; created_at: string; closed_at: string | null;
}
function toRoom(r: RoomRow): Room {
  return {
    id: r.id, name: r.name, adminId: r.admin_id, inviteCode: r.invite_code,
    status: r.status as RoomStatus, createdAt: r.created_at, closedAt: r.closed_at,
  };
}

// ---- users ----
export function upsertUser(telegramId: number, displayName: string | null, username: string | null = null): void {
  getDb().prepare(
    `INSERT INTO users (telegram_id, display_name, username) VALUES (?, ?, ?)
     ON CONFLICT(telegram_id) DO UPDATE SET
       display_name = COALESCE(excluded.display_name, users.display_name),
       username = COALESCE(excluded.username, users.username)`,
  ).run(telegramId, displayName, username);
}

// ---- rooms ----
export function insertRoom(name: string, adminId: number, inviteCode: string): number {
  const r = getDb().prepare(
    `INSERT INTO rooms (name, admin_id, invite_code) VALUES (?, ?, ?)`,
  ).run(name, adminId, inviteCode);
  return Number(r.lastInsertRowid);
}
export function getRoom(id: number): Room | null {
  const row = getDb().prepare(`SELECT * FROM rooms WHERE id = ?`).get(id) as RoomRow | undefined;
  return row ? toRoom(row) : null;
}
export function getRoomByInvite(code: string): Room | null {
  const row = getDb().prepare(`SELECT * FROM rooms WHERE invite_code = ?`).get(code) as RoomRow | undefined;
  return row ? toRoom(row) : null;
}
export function setRoomStatus(id: number, status: RoomStatus): void {
  getDb().prepare(
    `UPDATE rooms SET status = ?, closed_at = CASE WHEN ? = 'closed' THEN datetime('now') ELSE closed_at END WHERE id = ?`,
  ).run(status, status, id);
}
export function countRoomsForUser(telegramId: number): number {
  return (getDb().prepare(
    `SELECT COUNT(*) AS c FROM room_members m JOIN rooms r ON r.id = m.room_id
     WHERE m.telegram_id = ? AND r.status = 'active'`,
  ).get(telegramId) as { c: number }).c;
}
export function listRoomsForUser(telegramId: number): RoomWithRole[] {
  const rows = getDb().prepare(
    `SELECT r.*, m.role AS role FROM rooms r JOIN room_members m ON m.room_id = r.id
     WHERE m.telegram_id = ? AND r.status = 'active' ORDER BY r.created_at`,
  ).all(telegramId) as (RoomRow & { role: string })[];
  return rows.map((r) => ({ ...toRoom(r), role: r.role as MemberRole }));
}

// ---- membership ----
export interface Member { roomId: number; telegramId: number; role: MemberRole; joinedAt: string; }
interface MemberRow { room_id: number; telegram_id: number; role: string; joined_at: string; }
function toMember(r: MemberRow): Member {
  return { roomId: r.room_id, telegramId: r.telegram_id, role: r.role as MemberRole, joinedAt: r.joined_at };
}

export function addMember(roomId: number, telegramId: number, role: MemberRole): void {
  getDb().prepare(
    `INSERT INTO room_members (room_id, telegram_id, role) VALUES (?, ?, ?)
     ON CONFLICT(room_id, telegram_id) DO UPDATE SET role = excluded.role`,
  ).run(roomId, telegramId, role);
}
export function removeMember(roomId: number, telegramId: number): void {
  getDb().prepare(`DELETE FROM room_members WHERE room_id = ? AND telegram_id = ?`).run(roomId, telegramId);
}
export function getMember(roomId: number, telegramId: number): Member | null {
  const row = getDb().prepare(
    `SELECT * FROM room_members WHERE room_id = ? AND telegram_id = ?`,
  ).get(roomId, telegramId) as MemberRow | undefined;
  return row ? toMember(row) : null;
}
export function listMembers(roomId: number): Member[] {
  return (getDb().prepare(`SELECT * FROM room_members WHERE room_id = ? ORDER BY joined_at`).all(roomId) as MemberRow[]).map(toMember);
}
export function countMembers(roomId: number): number {
  return (getDb().prepare(`SELECT COUNT(*) AS c FROM room_members WHERE room_id = ?`).get(roomId) as { c: number }).c;
}

// ---- topics + updates ----
export interface TopicUpdate { id: number; topicId: number; authorId: number; text: string; createdAt: string; }
interface TopicRow {
  id: number; room_id: number; owner_id: number; kind: string; text: string;
  status: string; answer_note: string | null; created_at: string; answered_at: string | null;
  is_anonymous?: number;
}
function toTopic(r: TopicRow): Topic {
  return {
    id: r.id, roomId: r.room_id, ownerId: r.owner_id, kind: r.kind as TopicKind, text: r.text,
    status: r.status as TopicStatus, answerNote: r.answer_note, createdAt: r.created_at, answeredAt: r.answered_at,
    isAnonymous: !!r.is_anonymous,
  };
}

export function insertTopic(roomId: number, ownerId: number, kind: TopicKind, text: string, isAnonymous: boolean = false): number {
  const r = getDb().prepare(
    `INSERT INTO topics (room_id, owner_id, kind, text, is_anonymous) VALUES (?, ?, ?, ?, ?)`,
  ).run(roomId, ownerId, kind, text, isAnonymous ? 1 : 0);
  return Number(r.lastInsertRowid);
}
export function getTopic(id: number): Topic | null {
  const row = getDb().prepare(`SELECT * FROM topics WHERE id = ?`).get(id) as TopicRow | undefined;
  return row ? toTopic(row) : null;
}
export function listTopics(roomId: number): Topic[] {
  return (getDb().prepare(`SELECT * FROM topics WHERE room_id = ? ORDER BY created_at`).all(roomId) as TopicRow[]).map(toTopic);
}
// Counts ACTIVE topics. For personal, pass ownerId to scope to one member.
export function countActiveTopics(roomId: number, kind: TopicKind, ownerId?: number): number {
  if (ownerId !== undefined) {
    return (getDb().prepare(
      `SELECT COUNT(*) AS c FROM topics WHERE room_id = ? AND kind = ? AND owner_id = ? AND status = 'active'`,
    ).get(roomId, kind, ownerId) as { c: number }).c;
  }
  return (getDb().prepare(
    `SELECT COUNT(*) AS c FROM topics WHERE room_id = ? AND kind = ? AND status = 'active'`,
  ).get(roomId, kind) as { c: number }).c;
}
export function setTopicAnswered(id: number, answerNote: string): void {
  getDb().prepare(
    `UPDATE topics SET status = 'answered', answer_note = ?, answered_at = datetime('now') WHERE id = ?`,
  ).run(answerNote, id);
}
export function deleteActivePersonalTopics(roomId: number, ownerId: number): void {
  getDb().prepare(
    `DELETE FROM topics WHERE room_id = ? AND owner_id = ? AND kind = 'personal' AND status = 'active'`,
  ).run(roomId, ownerId);
}
export function insertTopicUpdate(topicId: number, authorId: number, text: string): void {
  getDb().prepare(`INSERT INTO topic_updates (topic_id, author_id, text) VALUES (?, ?, ?)`).run(topicId, authorId, text);
}
export function listTopicUpdates(topicId: number): TopicUpdate[] {
  return (getDb().prepare(`SELECT * FROM topic_updates WHERE topic_id = ? ORDER BY created_at`).all(topicId) as
    { id: number; topic_id: number; author_id: number; text: string; created_at: string }[])
    .map((r) => ({ id: r.id, topicId: r.topic_id, authorId: r.author_id, text: r.text, createdAt: r.created_at }));
}

// ─────────────────────────── Stage 2: prefs / assignments / prayer log ──────

export interface UserPrefs { telegramId: number; timezone: string | null; reminderTime: string | null; reminderEnabled: boolean; locale: string | null; }

export function getUserPrefs(telegramId: number): UserPrefs | null {
  const r = getDb().prepare(
    `SELECT telegram_id, timezone, reminder_time, reminder_enabled, locale FROM users WHERE telegram_id = ?`,
  ).get(telegramId) as { telegram_id: number; timezone: string | null; reminder_time: string | null; reminder_enabled: number; locale: string | null } | undefined;
  return r ? { telegramId: r.telegram_id, timezone: r.timezone, reminderTime: r.reminder_time, reminderEnabled: !!r.reminder_enabled, locale: r.locale } : null;
}
export function setUserLocale(telegramId: number, locale: string): void {
  getDb().prepare(`UPDATE users SET locale = ? WHERE telegram_id = ?`).run(locale, telegramId);
}
export function setReminderTime(telegramId: number, time: string | null): void {
  getDb().prepare(`UPDATE users SET reminder_time = ? WHERE telegram_id = ?`).run(time, telegramId);
}
export function setReminderEnabled(telegramId: number, enabled: boolean): void {
  getDb().prepare(`UPDATE users SET reminder_enabled = ? WHERE telegram_id = ?`).run(enabled ? 1 : 0, telegramId);
}
// Users who should get a reminder today: a time set and reminders enabled.
export function listReminderRecipients(): { telegramId: number; reminderTime: string }[] {
  return (getDb().prepare(
    `SELECT telegram_id, reminder_time FROM users WHERE reminder_time IS NOT NULL AND reminder_enabled = 1`,
  ).all() as { telegram_id: number; reminder_time: string }[]).map((r) => ({ telegramId: r.telegram_id, reminderTime: r.reminder_time }));
}

export interface Assignment { date: string; roomId: number; telegramId: number; sharedTopicId: number | null; personalTopicId: number | null; }
export function upsertAssignment(date: string, roomId: number, telegramId: number, sharedTopicId: number | null, personalTopicId: number | null): void {
  getDb().prepare(
    `INSERT INTO daily_assignment (date, room_id, telegram_id, shared_topic_id, personal_topic_id)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(date, room_id, telegram_id) DO UPDATE SET shared_topic_id = excluded.shared_topic_id, personal_topic_id = excluded.personal_topic_id`,
  ).run(date, roomId, telegramId, sharedTopicId, personalTopicId);
}
export function getAssignmentsForUser(telegramId: number, date: string): Assignment[] {
  return (getDb().prepare(
    `SELECT date, room_id, telegram_id, shared_topic_id, personal_topic_id FROM daily_assignment WHERE telegram_id = ? AND date = ?`,
  ).all(telegramId, date) as { date: string; room_id: number; telegram_id: number; shared_topic_id: number | null; personal_topic_id: number | null }[])
    .map((r) => ({ date: r.date, roomId: r.room_id, telegramId: r.telegram_id, sharedTopicId: r.shared_topic_id, personalTopicId: r.personal_topic_id }));
}
export function hasAssignmentsForRoomDate(roomId: number, date: string): boolean {
  return !!getDb().prepare(`SELECT 1 FROM daily_assignment WHERE room_id = ? AND date = ? LIMIT 1`).get(roomId, date);
}

export function recordPrayer(telegramId: number, roomId: number, topicId: number, prayedDate: string): void {
  getDb().prepare(
    `INSERT OR IGNORE INTO prayer_log (telegram_id, room_id, topic_id, prayed_date) VALUES (?, ?, ?, ?)`,
  ).run(telegramId, roomId, topicId, prayedDate);
}
export function hasPrayed(telegramId: number, topicId: number, prayedDate: string): boolean {
  return !!getDb().prepare(
    `SELECT 1 FROM prayer_log WHERE telegram_id = ? AND topic_id = ? AND prayed_date = ?`,
  ).get(telegramId, topicId, prayedDate);
}

// Active topics of a kind in a room, ordered by id (stable rotation order).
export function listActiveTopics(roomId: number, kind: TopicKind): Topic[] {
  return (getDb().prepare(
    `SELECT * FROM topics WHERE room_id = ? AND kind = ? AND status = 'active' ORDER BY id`,
  ).all(roomId, kind) as TopicRow[]).map(toTopic);
}
export function listActiveRooms(): Room[] {
  return (getDb().prepare(`SELECT * FROM rooms WHERE status = 'active' ORDER BY id`).all() as RoomRow[]).map(toRoom);
}

// ─────────────────────────── Stage 2b: sent_assignment ──────────────────────

export interface SentAssignment { chatId: number; messageId: number; topicId: number; roomId: number; sentDate: string; }
export function recordSent(chatId: number, messageId: number, topicId: number, roomId: number, sentDate: string): void {
  getDb().prepare(
    `INSERT OR IGNORE INTO sent_assignment (chat_id, message_id, topic_id, room_id, sent_date) VALUES (?, ?, ?, ?, ?)`,
  ).run(chatId, messageId, topicId, roomId, sentDate);
}
export function getSentByMessage(chatId: number, messageId: number): SentAssignment | null {
  const r = getDb().prepare(
    `SELECT chat_id, message_id, topic_id, room_id, sent_date FROM sent_assignment WHERE chat_id = ? AND message_id = ?`,
  ).get(chatId, messageId) as { chat_id: number; message_id: number; topic_id: number; room_id: number; sent_date: string } | undefined;
  return r ? { chatId: r.chat_id, messageId: r.message_id, topicId: r.topic_id, roomId: r.room_id, sentDate: r.sent_date } : null;
}
export function hasSentToday(chatId: number, date: string): boolean {
  return !!getDb().prepare(`SELECT 1 FROM sent_assignment WHERE chat_id = ? AND sent_date = ? LIMIT 1`).get(chatId, date);
}
export function listActiveRoomsForUser(telegramId: number): Room[] {
  return (getDb().prepare(
    `SELECT r.* FROM rooms r JOIN room_members m ON m.room_id = r.id
     WHERE m.telegram_id = ? AND r.status = 'active' ORDER BY r.id`,
  ).all(telegramId) as RoomRow[]).map(toRoom);
}

// ─────────────────────────── Stage 3: accountability ────────────────────────

export interface MembershipState { roomId: number; telegramId: number; lastPrayedDate: string | null; missStreak: number; warnedAt: string | null; }
export function getMembershipState(roomId: number, telegramId: number): MembershipState | null {
  const r = getDb().prepare(
    `SELECT room_id, telegram_id, last_prayed_date, miss_streak, warned_at FROM membership_state WHERE room_id = ? AND telegram_id = ?`,
  ).get(roomId, telegramId) as { room_id: number; telegram_id: number; last_prayed_date: string | null; miss_streak: number; warned_at: string | null } | undefined;
  return r ? { roomId: r.room_id, telegramId: r.telegram_id, lastPrayedDate: r.last_prayed_date, missStreak: r.miss_streak, warnedAt: r.warned_at } : null;
}
export function upsertMembershipState(roomId: number, telegramId: number, lastPrayedDate: string | null, missStreak: number, warnedAt: string | null): void {
  getDb().prepare(
    `INSERT INTO membership_state (room_id, telegram_id, last_prayed_date, miss_streak, warned_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(room_id, telegram_id) DO UPDATE SET
       last_prayed_date = excluded.last_prayed_date, miss_streak = excluded.miss_streak, warned_at = excluded.warned_at`,
  ).run(roomId, telegramId, lastPrayedDate, missStreak, warnedAt);
}
export function deleteMembershipState(roomId: number, telegramId: number): void {
  getDb().prepare(`DELETE FROM membership_state WHERE room_id = ? AND telegram_id = ?`).run(roomId, telegramId);
}
export function lastPrayedDate(telegramId: number, roomId: number): string | null {
  const r = getDb().prepare(
    `SELECT MAX(prayed_date) AS d FROM prayer_log WHERE telegram_id = ? AND room_id = ?`,
  ).get(telegramId, roomId) as { d: string | null };
  return r.d;
}

export function hasPrayableTopicForMember(roomId: number, telegramId: number): boolean {
  // A member can pray for shared topics and for other members' personal topics,
  // never for their own personal topic. Do not hold someone accountable when
  // the room gives them no topic they can actually receive or confirm.
  return !!getDb().prepare(
    `SELECT 1 FROM topics
     WHERE room_id = ? AND status = 'active'
       AND (kind = 'shared' OR (kind = 'personal' AND owner_id != ?))
     LIMIT 1`,
  ).get(roomId, telegramId);
}
// Memberships subject to accountability: plain members of active rooms (admins exempt in their own room).
export function listEvaluableMemberships(): { roomId: number; telegramId: number; joinedAt: string }[] {
  return (getDb().prepare(
    `SELECT m.room_id, m.telegram_id, m.joined_at FROM room_members m JOIN rooms r ON r.id = m.room_id
     WHERE m.role = 'member' AND r.status = 'active' ORDER BY m.room_id, m.telegram_id`,
  ).all() as { room_id: number; telegram_id: number; joined_at: string }[])
    .map((r) => ({ roomId: r.room_id, telegramId: r.telegram_id, joinedAt: r.joined_at }));
}
export function getDisplayName(telegramId: number): string | null {
  const r = getDb().prepare(`SELECT display_name FROM users WHERE telegram_id = ?`).get(telegramId) as { display_name: string | null } | undefined;
  return r ? r.display_name : null;
}
export function getUserInfo(telegramId: number): { displayName: string | null; username: string | null } | null {
  const r = getDb().prepare(`SELECT display_name, username FROM users WHERE telegram_id = ?`).get(telegramId) as { display_name: string | null; username: string | null } | undefined;
  return r ? { displayName: r.display_name, username: r.username } : null;
}
