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
