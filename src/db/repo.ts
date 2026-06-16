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

// ---- membership (addMember needed by room tests; full membership block in next section) ----
export function addMember(roomId: number, telegramId: number, role: MemberRole): void {
  getDb().prepare(
    `INSERT INTO room_members (room_id, telegram_id, role) VALUES (?, ?, ?)
     ON CONFLICT(room_id, telegram_id) DO UPDATE SET role = excluded.role`,
  ).run(roomId, telegramId, role);
}
