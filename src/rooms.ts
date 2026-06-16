import { randomBytes } from 'node:crypto';
import * as repo from './db/repo.ts';
import type { Room, Topic } from './db/repo.ts';
import { MAX_ROOMS_PER_USER, MAX_SHARED_TOPICS_PER_ROOM, MAX_PERSONAL_TOPICS_PER_MEMBER } from './preferences.ts';

export type RoomError =
  | 'room_cap' | 'shared_cap' | 'personal_cap'
  | 'invite_invalid' | 'invite_closed' | 'already_member'
  | 'not_member' | 'not_admin' | 'not_owner'
  | 'room_not_found' | 'topic_not_found';

export type Result<T> = { ok: true; value: T } | { ok: false; error: RoomError };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = (error: RoomError): Result<never> => ({ ok: false, error });

const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export function generateInviteCode(): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    const bytes = randomBytes(8);
    let code = '';
    for (let i = 0; i < 8; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    if (!repo.getRoomByInvite(code)) return code;
  }
  throw new Error('could not generate a unique invite code');
}

export function createRoom(adminId: number, name: string): Result<Room> {
  if (repo.countRoomsForUser(adminId) >= MAX_ROOMS_PER_USER) return err('room_cap');
  const code = generateInviteCode();
  const id = repo.insertRoom(name, adminId, code);
  repo.addMember(id, adminId, 'admin');
  const room = repo.getRoom(id);
  return room ? ok(room) : err('room_not_found');
}

export function joinRoom(telegramId: number, code: string): Result<Room> {
  const room = repo.getRoomByInvite(code.trim());
  if (!room) return err('invite_invalid');
  if (room.status !== 'active') return err('invite_closed');
  if (repo.getMember(room.id, telegramId)) return err('already_member');
  if (repo.countRoomsForUser(telegramId) >= MAX_ROOMS_PER_USER) return err('room_cap');
  repo.addMember(room.id, telegramId, 'member');
  return ok(room);
}
