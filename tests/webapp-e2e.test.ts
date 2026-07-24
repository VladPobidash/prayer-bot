import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { startHealthServer } from '../src/server.ts';
import { initDb, closeDb } from '../src/db/connection.ts';
import { generateTestInitData } from '../src/auth.ts';
import config from '../src/config.ts';

test('Full Mini App E2E Flow: Static assets, Auth, Room Lifecycle, Topics, Updates, Anonymous Topics, Prayer Logging, and Settings', async () => {
  initDb(':memory:');
  const server = startHealthServer(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const botToken = config.telegramBotToken;

  // 1. Static asset verification
  const htmlRes = await fetch(`${baseUrl}/`);
  assert.equal(htmlRes.status, 200);
  const htmlText = await htmlRes.text();
  assert.ok(htmlText.includes('Prayer Bot App'));

  const cssRes = await fetch(`${baseUrl}/style.css`);
  assert.equal(cssRes.status, 200);

  const jsRes = await fetch(`${baseUrl}/app.js`);
  assert.equal(jsRes.status, 200);

  // 2. User Alice authentication
  const aliceUser = { id: 8001, first_name: 'Alice' };
  const aliceInitData = generateTestInitData(aliceUser, botToken);
  const aliceHeaders = { Authorization: `Bearer ${aliceInitData}`, 'Content-Type': 'application/json' };

  const aliceMeRes = await fetch(`${baseUrl}/api/me`, { headers: { Authorization: `Bearer ${aliceInitData}` } });
  assert.equal(aliceMeRes.status, 200);
  const aliceMeData = (await aliceMeRes.json()) as { user: { id: number; firstName: string } };
  assert.equal(aliceMeData.user.id, 8001);
  assert.equal(aliceMeData.user.firstName, 'Alice');

  // 3. Alice creates a prayer room
  const createRoomRes = await fetch(`${baseUrl}/api/rooms`, {
    method: 'POST',
    headers: aliceHeaders,
    body: JSON.stringify({ name: 'Unity Group' })
  });
  assert.equal(createRoomRes.status, 201);
  const room = (await createRoomRes.json()) as { id: number; name: string; inviteCode: string };
  assert.equal(room.name, 'Unity Group');

  // 4. User Bob authenticates & joins room
  const bobUser = { id: 8002, first_name: 'Bob' };
  const bobInitData = generateTestInitData(bobUser, botToken);
  const bobHeaders = { Authorization: `Bearer ${bobInitData}`, 'Content-Type': 'application/json' };

  const joinRes = await fetch(`${baseUrl}/api/rooms/join`, {
    method: 'POST',
    headers: bobHeaders,
    body: JSON.stringify({ code: room.inviteCode })
  });
  assert.equal(joinRes.status, 200);
  const joinedRoom = (await joinRes.json()) as { id: number; name: string };
  assert.equal(joinedRoom.name, 'Unity Group');

  // 5. Alice adds a Shared Topic (Admin only)
  const sharedTopicRes = await fetch(`${baseUrl}/api/rooms/${room.id}/topics`, {
    method: 'POST',
    headers: aliceHeaders,
    body: JSON.stringify({ kind: 'shared', text: 'Group wisdom and strength' })
  });
  assert.equal(sharedTopicRes.status, 201);
  const sharedTopic = (await sharedTopicRes.json()) as { id: number; text: string };

  // 6. Bob adds a Personal Topic with display name
  const personalTopicRes = await fetch(`${baseUrl}/api/rooms/${room.id}/topics`, {
    method: 'POST',
    headers: bobHeaders,
    body: JSON.stringify({ kind: 'personal', text: 'Family health request' })
  });
  assert.equal(personalTopicRes.status, 201);
  const personalTopic = (await personalTopicRes.json()) as { id: number; text: string };

  // 6b. Bob adds an Anonymous Personal Topic
  const anonTopicRes = await fetch(`${baseUrl}/api/rooms/${room.id}/topics`, {
    method: 'POST',
    headers: bobHeaders,
    body: JSON.stringify({ kind: 'personal', text: 'Unspoken prayer request', isAnonymous: true })
  });
  assert.equal(anonTopicRes.status, 201);

  // 7. Bob posts progress update to personal topic
  const updateRes = await fetch(`${baseUrl}/api/topics/${personalTopic.id}/update`, {
    method: 'POST',
    headers: bobHeaders,
    body: JSON.stringify({ text: 'Feeling much better today!' })
  });
  assert.equal(updateRes.status, 200);

  // 8. Alice logs prayer prayed today
  const prayRes = await fetch(`${baseUrl}/api/topics/${sharedTopic.id}/pray`, {
    method: 'POST',
    headers: aliceHeaders
  });
  assert.equal(prayRes.status, 200);

  // 9. Bob marks personal topic answered
  const answerRes = await fetch(`${baseUrl}/api/topics/${personalTopic.id}/answer`, {
    method: 'POST',
    headers: bobHeaders,
    body: JSON.stringify({ text: 'Praise God for full recovery!' })
  });
  assert.equal(answerRes.status, 200);

  // 10. Alice updates notification settings
  const settingsRes = await fetch(`${baseUrl}/api/me/reminder`, {
    method: 'PUT',
    headers: aliceHeaders,
    body: JSON.stringify({ enabled: true, time: '07:45' })
  });
  assert.equal(settingsRes.status, 200);

  // 11. Verify room details state, admin name & anonymous topic flags
  const roomDetailRes = await fetch(`${baseUrl}/api/rooms/${room.id}`, {
    headers: { Authorization: `Bearer ${aliceInitData}` }
  });
  assert.equal(roomDetailRes.status, 200);
  const roomDetail = (await roomDetailRes.json()) as { adminName: string; members: any[]; sharedTopics: any[]; personalTopics: any[] };
  assert.equal(roomDetail.adminName, 'Alice');
  assert.equal(roomDetail.members.length, 2);
  assert.equal(roomDetail.sharedTopics.length, 1);
  assert.equal(roomDetail.personalTopics.length, 2);

  const bobTopic = roomDetail.personalTopics.find((t: any) => t.text === 'Family health request');
  const anonTopic = roomDetail.personalTopics.find((t: any) => t.text === 'Unspoken prayer request');
  assert.ok(bobTopic, 'Bob topic should exist');
  assert.ok(anonTopic, 'Anonymous topic should exist');
  assert.equal(bobTopic.authorName, 'Bob');
  assert.equal(anonTopic.authorName, 'Anonymous');

  await new Promise<void>((r) => server.close(() => r()));
  closeDb();
});
