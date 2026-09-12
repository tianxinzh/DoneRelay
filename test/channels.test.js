import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Telegram } from '../src/channels/telegram.js';
import { Weixin } from '../src/channels/weixin.js';
const store = () => { const state = {}; return { meta(k, v) { if (v !== undefined) state[k] = v; return state[k]; } }; };
const response = (data, ok = true) => ({ ok, json: async () => data });

test('Telegram sends plain text and exact approval callbacks', async () => {
  let request;
  const telegram = new Telegram({ token: '123:secret', chatId: '10', userId: '10', store: store(), fetchImpl: async (url, opts) => { request = { url, ...opts }; return response({ ok: true, result: {} }); } });
  await telegram.send('<untrusted text>', { kind: 'approval', id: 'ABCDEF012345' });
  const body = JSON.parse(request.body);
  assert.equal(body.parse_mode, undefined);
  assert.equal(body.reply_markup.inline_keyboard[0][0].callback_data, 'approve ABCDEF012345');
  assert.equal(request.redirect, 'error');
});
test('Telegram rejects a valid user callback forwarded into another chat', async () => {
  let called = false;
  const telegram = new Telegram({ token: '123:secret', chatId: '10', userId: '10', store: store() });
  telegram.relay = { receive() { called = true; } };
  await telegram.handle({ callback_query: { from: { id: 10 }, data: 'approve ABCDEF012345', message: { chat: { id: 999, type: 'private' } } } });
  assert.equal(called, false);
});
test('Telegram transport error does not leak the URL containing bot token', async () => {
  const telegram = new Telegram({ token: '123:secret', chatId: '10', userId: '10', store: store(), fetchImpl: async (url) => { throw Error(url); } });
  await assert.rejects(telegram.send('hello'), (error) => !error.message.includes('secret') && error.status === 502);
});
test('Weixin send requires context and constructs the documented text message', async () => {
  let body;
  const s = store();
  const weixin = new Weixin({ token: 'secret', userId: 'owner', store: s, fetchImpl: async (_url, opts) => { body = JSON.parse(opts.body); return response({ ret: 0 }); } });
  await assert.rejects(weixin.send('hello'), /context/);
  s.meta('weixinContext', 'context-1'); await weixin.send('hello');
  assert.equal(body.msg.context_token, 'context-1'); assert.equal(body.msg.to_user_id, 'owner');
  assert.equal(body.msg.message_type, 2); assert.equal(body.msg.item_list[0].text_item.text, 'hello');
});
test('Weixin ignores unbound senders and group traffic without changing context', async () => {
  const s = store(); let called = false;
  const weixin = new Weixin({ token: 'secret', userId: 'owner', store: s });
  weixin.relay = { receive() { called = true; } };
  for (const m of [{ from_user_id: 'other', message_type: 1 }, { from_user_id: 'owner', message_type: 1, group_id: 'group' }]) {
    await weixin.handle({ ...m, context_token: 'evil', item_list: [{ type: 1, text_item: { text: 'approve ABCDEF012345' } }] });
  }
  assert.equal(called, false); assert.equal(s.meta('weixinContext'), undefined);
});
test('Weixin checks business errors even when HTTP succeeds', async () => {
  const weixin = new Weixin({ token: 'secret', userId: 'owner', contextToken: 'context', store: store(), fetchImpl: async () => response({ ret: -14 }) });
  await assert.rejects(weixin.send('hello'), (e) => e.status === 401);
});
test('Weixin never sends bot credentials to a non-Weixin API origin', () => {
  assert.throws(() => new Weixin({ token: 'secret', userId: 'owner', baseUrl: 'https://weixin.qq.com.evil.example', store: store() }), /origin/);
});
