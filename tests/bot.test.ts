import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Telegraf } from 'telegraf';
import { createBot, safeEditMessageText } from '../src/bot.ts';

test('createBot returns a Telegraf instance and does not launch', () => {
  const bot = createBot('123456:FAKE');
  assert.ok(bot instanceof Telegraf);
});

test('safeEditMessageText swallows "message is not modified"', async () => {
  const ctx = {
    editMessageText: async () => {
      throw { description: 'Bad Request: message is not modified' };
    },
  };
  await assert.doesNotReject(() => safeEditMessageText(ctx as never, 'x'));
});

test('safeEditMessageText rethrows other errors', async () => {
  const ctx = {
    editMessageText: async () => { throw new Error('network down'); },
  };
  await assert.rejects(() => safeEditMessageText(ctx as never, 'x'), /network down/);
});
