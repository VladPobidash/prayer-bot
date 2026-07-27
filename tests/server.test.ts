import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { startHealthServer } from '../src/server.ts';
import { initDb, closeDb } from '../src/db/connection.ts';
import { generateTestInitData } from '../src/auth.ts';
import config from '../src/config.ts';

test('GET /health, static assets, and authenticated API endpoints', async () => {
  initDb(':memory:');
  const server = startHealthServer(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  // 1. Health endpoint
  const ok = await fetch(`${baseUrl}/health`);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { status: 'ok' });

  // 2. Static asset /
  const htmlRes = await fetch(`${baseUrl}/`);
  assert.equal(htmlRes.status, 200);
  const htmlText = await htmlRes.text();
  assert.ok(htmlText.includes('Prayer Room'));

  // 3. API Unauthorized without token
  const unauthRes = await fetch(`${baseUrl}/api/me`);
  assert.equal(unauthRes.status, 401);

  // 4. API Authenticated with valid Telegram initData
  const initData = generateTestInitData({ id: 1001, first_name: 'Alice' }, config.telegramBotToken);
  const meRes = await fetch(`${baseUrl}/api/me`, {
    headers: { Authorization: `Bearer ${initData}` }
  });
  assert.equal(meRes.status, 200);
  const meData = (await meRes.json()) as { user: { id: number; firstName: string; locale?: string }; locales?: Record<string, unknown> };
  assert.equal(meData.user.id, 1001);
  assert.equal(meData.user.firstName, 'Alice');
  assert.ok(meData.locales);
  assert.ok(meData.locales['en']);

  // Update settings (locale) via PUT /api/me/settings
  const updateSettingsRes = await fetch(`${baseUrl}/api/me/settings`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${initData}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ locale: 'en' })
  });
  assert.equal(updateSettingsRes.status, 200);

  // Verify updated locale in GET /api/me
  const updatedMeRes = await fetch(`${baseUrl}/api/me`, {
    headers: { Authorization: `Bearer ${initData}` }
  });
  const updatedMeData = (await updatedMeRes.json()) as { user: { locale: string } };
  assert.equal(updatedMeData.user.locale, 'en');

  // 5. Create room via POST /api/rooms
  const createRoomRes = await fetch(`${baseUrl}/api/rooms`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${initData}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: 'Morning Prayer' })
  });
  assert.equal(createRoomRes.status, 201);
  const roomData = (await createRoomRes.json()) as { name: string };
  assert.equal(roomData.name, 'Morning Prayer');

  // 6. List rooms via GET /api/rooms
  const listRoomsRes = await fetch(`${baseUrl}/api/rooms`, {
    headers: { Authorization: `Bearer ${initData}` }
  });
  assert.equal(listRoomsRes.status, 200);
  const roomsList = (await listRoomsRes.json()) as Array<{ isAdmin: boolean }>;
  assert.equal(roomsList.length, 1);
  assert.equal(roomsList[0].isAdmin, true);

  await new Promise<void>((r) => server.close(() => r()));
  closeDb();
});
