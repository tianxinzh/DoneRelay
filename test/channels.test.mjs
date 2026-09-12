import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.mjs';
import { Telegram } from '../src/channels/telegram.mjs';
import { Weixin, weixinBase } from '../src/channels/weixin.mjs';

test('Telegram sends plain text, no parse_mode or arbitrary destination', async t => {
  const store = new Store(); t.after(() => store.close());
  let captured;
  const channel = new Telegram({ token: 'fake', userId: '123', chatId: '123', store,
    request: async (url, opts) => { captured = { url, body: JSON.parse(opts.body) }; return { ok: true, result: { message_id: 7 } }; } });
  assert.equal(await channel.send('<not HTML>'), 7);
  assert.equal(captured.body.chat_id, '123'); assert.equal(captured.body.parse_mode, undefined);
});
test('Telegram sender AND chat must be bound; forwarded callback from wrong chat ignored', async t => {
  const store = new Store(); t.after(() => store.close()); let received = 0;
  const channel = new Telegram({ token: 'fake', userId: '123', chatId: '123', store });
  await channel.handle({ message: { message_id: 1, from: { id: 123 }, chat: { id: 456, type: 'private' }, text: 'hello' } }, () => received++);
  await channel.handle({ message: { message_id: 2, from: { id: 123 }, chat: { id: 123, type: 'private' }, text: 'hello' } }, () => received++);
  assert.equal(received, 1);
});
test('Weixin refuses unaudited endpoints and redirect targets', () => {
  for (const host of ['http://ilinkai.weixin.qq.com', 'https://evil.com', 'https://ilinkai.weixin.qq.com.evil.com',
    'https://ilinkai.weixin.qq.com:444', 'https://user:pass@ilinkai.weixin.qq.com', 'https://ilinkai.weixin.qq.com/path']) assert.throws(() => weixinBase(host));
  assert.equal(weixinBase(), 'https://ilinkai.weixin.qq.com');
});
test('Weixin requires a context token; only configured private sender can establish one', async t => {
  const store = new Store(); t.after(() => store.close()); let wire, received;
  const channel = new Weixin({ token: 'fake', userId: 'owner', store,
    request: async (url, opts) => { wire = { url, headers: opts.headers, body: JSON.parse(opts.body) }; return { ret: 0 }; } });
  await assert.rejects(channel.send('hello'), /context/);
  await channel.handle({ from_user_id: 'intruder', message_type: 1, context_token: 'bad' }, () => {});
  await channel.handle({ from_user_id: 'owner', group_id: 'group', message_type: 1, context_token: 'bad' }, () => {});
  assert.equal(store.getState('weixin:context:owner'), null);
  await channel.handle({ from_user_id: 'owner', message_type: 1, context_token: 'good', item_list: [{ type: 1, text_item: { text: 'hello' } }] }, e => { received = e; });
  await channel.send('Ready');
  assert.equal(received.userId, 'owner'); assert.equal(wire.body.msg.context_token, 'good');
  assert.equal(wire.body.msg.to_user_id, 'owner'); assert.equal(wire.body.base_info.bot_agent, 'DoneRelay/0.1.0');
  assert.equal(wire.headers.Authorization, 'Bearer fake');
});
test('Weixin application errors cannot be mistaken for successful delivery', async t => {
  const store = new Store(); t.after(() => store.close()); store.setState('weixin:context:owner', 'context');
  const channel = new Weixin({ token: 'fake', userId: 'owner', store, request: async () => ({ ret: -14 }) });
  await assert.rejects(channel.send('hello'), e => e.sessionExpired === true);
});
