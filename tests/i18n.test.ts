import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t } from '../src/i18n.ts';

test('returns the requested locale string', () => {
  assert.equal(t('en', 'help').startsWith('Commands'), true);
});

test('unknown locale falls back to the default (uk)', () => {
  assert.equal(t('xx', 'help').startsWith('Команди'), true);
});

test('interpolates {vars}', () => {
  assert.equal(t('en', 'greeting', { name: 'Sam' }), 'Hello, Sam!');
});

test('leaves an unsupplied placeholder intact', () => {
  assert.equal(t('en', 'greeting', {}), 'Hello, {name}!');
});

test('stage 3 accountability strings resolve in all locales', () => {
  for (const locale of ['uk', 'en', 'ru']) {
    assert.ok(t(locale, 'accountability_warning', { room: 'R' }).includes('R'));
    assert.ok(t(locale, 'removed_member', { room: 'R' }).includes('R'));
    const admin = t(locale, 'removed_admin', { name: 'N', room: 'R' });
    assert.ok(admin.includes('N') && admin.includes('R'));
  }
});
