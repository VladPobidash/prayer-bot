import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { startHealthServer } from '../src/server.ts';

test('GET /health → 200 ok; unknown route → 404', async () => {
  const server = startHealthServer(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  const { port } = server.address() as AddressInfo;

  const ok = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { status: 'ok' });

  const notFound = await fetch(`http://127.0.0.1:${port}/nope`);
  assert.equal(notFound.status, 404);

  await new Promise<void>((r) => server.close(() => r()));
});
