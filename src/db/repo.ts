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
export function upsertUser(telegramId: number, displayName: string | null): void {
  getDb().prepare(
    `INSERT INTO users (telegram_id, display_name) VALUES (?, ?)
     ON CONFLICT(telegram_id) DO UPDATE SET display_name = COALESCE(excluded.display_name, users.display_name)`,
  ).run(telegramId, displayName);
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
}
function toTopic(r: TopicRow): Topic {
  return {
    id: r.id, roomId: r.room_id, ownerId: r.owner_id, kind: r.kind as TopicKind, text: r.text,
    status: r.status as TopicStatus, answerNote: r.answer_note, createdAt: r.created_at, answeredAt: r.answered_at,
  };
}

export function insertTopic(roomId: number, ownerId: number, kind: TopicKind, text: string): number {
  const r = getDb().prepare(
    `INSERT INTO topics (room_id, owner_id, kind, text) VALUES (?, ?, ?, ?)`,
  ).run(roomId, ownerId, kind, text);
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
