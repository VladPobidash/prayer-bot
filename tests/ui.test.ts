import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t } from '../src/i18n.ts';
import { errorKey } from '../src/i18n.ts';

test('i18n: Stage 1b keys exist in all locales', () => {
  for (const loc of ['uk', 'en', 'ru']) {
    assert.ok(t(loc, 'start_welcome').length > 0);
    assert.ok(t(loc, 'help').length > 0);
    assert.ok(t(loc, 'menu_title').length > 0);
    assert.ok(t(loc, 'room_created', { name: 'X', code: 'abc' }).includes('abc'));
  }
});

test('errorKey maps every RoomError to a translatable key', () => {
  const errs = ['room_cap','shared_cap','personal_cap','invite_invalid','invite_closed',
    'already_member','not_member','not_admin','not_owner','room_not_found','topic_not_found'] as const;
  for (const e of errs) {
    const key = errorKey(e);
    assert.ok(t('uk', key).length > 0, `missing uk text for ${key}`);
  }
});

import { renderRoomView, errorText, mainMenu, roomsList } from '../src/ui.ts';
import type { Room, Topic, Member } from '../src/db/repo.ts';

const room = (over: Partial<Room> = {}): Room => ({
  id: 1, name: 'Morning', adminId: 1, inviteCode: 'abc', status: 'active',
  createdAt: '', closedAt: null, ...over,
});
const topic = (over: Partial<Topic> = {}): Topic => ({
  id: 1, roomId: 1, ownerId: 2, kind: 'personal', text: 'My exam', status: 'active',
  answerNote: null, createdAt: '', answeredAt: null, ...over,
});

test('errorText returns the localized message for a RoomError', () => {
  assert.equal(errorText('not_admin', 'en'), 'Only the room admin can do that.');
});

test('mainMenu has the four entries', () => {
  const kb = mainMenu('en');
  const flat = JSON.stringify(kb);
  for (const d of ['menu:rooms', 'menu:create', 'menu:join', 'menu:help']) assert.ok(flat.includes(d));
});

test('i18n: Stage 2b reminder keys exist in all locales', () => {
  for (const loc of ['uk', 'en', 'ru']) {
    assert.ok(t(loc, 'reminder_shared', { room: 'R', text: 'X' }).includes('X'));
    assert.ok(t(loc, 'btn_prayed').length > 0);
    assert.ok(t(loc, 'prayed_ack').length > 0);
    assert.ok(t(loc, 'confirm_to_owner', { name: 'N', text: 'X' }).includes('N'));
    assert.ok(t(loc, 'reminder_prompt').length > 0);
  }
});

test('renderRoomView shows admin buttons only for the admin', () => {
  const topics = [topic({ id: 9, ownerId: 2, kind: 'personal', text: 'Mine' })];
  const members: Member[] = [
    { roomId: 1, telegramId: 1, role: 'admin', joinedAt: '' },
    { roomId: 1, telegramId: 2, role: 'member', joinedAt: '' },
  ];
  const adminView = renderRoomView(room(), topics, members, 1, 'en');
  const memberView = renderRoomView(room(), topics, members, 2, 'en');
  assert.ok(JSON.stringify(adminView.keyboard).includes('room:addshared:1')); // admin only
  assert.ok(JSON.stringify(adminView.keyboard).includes('room:close:1'));
  assert.ok(!JSON.stringify(memberView.keyboard).includes('room:close:1'));   // member: no close
  assert.ok(JSON.stringify(memberView.keyboard).includes('room:leave:1'));    // member: leave
  assert.ok(!JSON.stringify(adminView.keyboard).includes('room:leave:1'));    // admin: no leave
  assert.ok(memberView.text.includes('Morning'));
});
