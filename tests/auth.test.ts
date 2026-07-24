import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateInitData, generateTestInitData } from '../src/auth.ts';

test('validateInitData validates valid initData', () => {
  const token = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
  const user = { id: 999, first_name: 'TestUser' };
  const initData = generateTestInitData(user, token);

  const res = validateInitData(initData, token);
  assert.equal(res.valid, true);
  assert.equal(res.user?.id, 999);
  assert.equal(res.user?.first_name, 'TestUser');
});

test('validateInitData rejects invalid hash', () => {
  const token = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
  const user = { id: 999, first_name: 'TestUser' };
  let initData = generateTestInitData(user, token);
  initData = initData.replace(/hash=[a-f0-9]+/, 'hash=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');

  const res = validateInitData(initData, token);
  assert.equal(res.valid, false);
  assert.equal(res.error, 'invalid hash signature');
});

test('validateInitData rejects missing hash or empty string', () => {
  const token = '123456:ABC-DEF';
  assert.equal(validateInitData('', token).valid, false);
  assert.equal(validateInitData('user=%7B%22id%22%3A123%7D', token).valid, false);
});
