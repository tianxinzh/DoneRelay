import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { Store } from '../src/store.js';
import { Relay, formatRequest } from '../src/relay.js';
import { WhatsApp, makeWhatsAppWebhookServer } from '../src/channels/whatsapp.js';

const CONFIG = { token: 'test-access-token-not-a-real-secret', appSecret: 'test-app-secret-not-real',
  verifyToken: 'test-verify-token-32-characters-long', phoneNumberId: '10000000001',
  businessAccountId: '20000000001', userId: '15555550123', graphVersion: 'v23.0' };
let sequence = 0;
function setup(t, fetchImpl) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'donerelay-wa-'));
  const time = { ms: 1800000000000 }; const now = () => time.ms;
  const store = new Store(path.join(dir, 'state.json'), now);
  t.after(() => { store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const sent = [];
  const channel = new WhatsApp({ ...CONFIG, store, now, fetchImpl: fetchImpl ?? (async (url, options) => {
    sent.push({ url, options, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ messaging_product: 'whatsapp', messages: [{ id: `wamid.out.${sent.length}` }] }) };
  }) });
  const other = { authorize: (a) => a.userId === 'owner', send: async () => {} };
  const relay = new Relay(store, { whatsapp: channel, telegram: other, weixin: other }, now);
  function envelope(text = 'START', options = {}) {
    const m = { id: options.id ?? `wamid.in.${++sequence}`, from: CONFIG.userId,
      timestamp: String(Math.floor(time.ms / 1000)), type: 'text', text: { body: text }, ...options.message };
    const payload = { object: 'whatsapp_business_account', entry: [{ id: CONFIG.businessAccountId,
      changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: CONFIG.phoneNumberId }, messages: [m] } }] }] };
    options.mutate?.(payload);
    const raw = Buffer.from(JSON.stringify(payload));
    const signature = 'sha256=' + createHmac('sha256', CONFIG.appSecret).update(raw).digest('hex');
    return { raw, signature, payload };
  }
  const receive = (text, options) => { const e = envelope(text, options); return channel.handle(e.raw, e.signature); };
  const request = (kind = 'approval', extra = {}) => relay.create({ kind, task: 'checkout / staging',
    message: 'Deploy commit 8f2c91a to staging only. Production unchanged.', channels: ['whatsapp'], ...extra });
  return { channel, relay, store, sent, time, envelope, receive, request, dir };
}

test('WhatsApp requires explicit opt-in, then START enables sending', async (t) => {
  const f = setup(t);
  assert.equal((await f.request()).deliveries.whatsapp.code, 'whatsapp_opt_in_required');
  f.receive('hello');
  assert.equal((await f.request()).deliveries.whatsapp.code, 'whatsapp_opt_in_required');
  f.time.ms += 1000; f.receive('START');
  const r = await f.request(); assert.equal(r.deliveries.whatsapp.status, 'sent');
  assert.equal(r.deliveries.whatsapp.providerMessageId, 'wamid.out.1');
});
test('WhatsApp sends exact action buttons to a fixed recipient and Graph origin', async (t) => {
  const f = setup(t); f.receive('START'); const r = await f.request();
  assert.equal(f.sent[0].url, 'https://graph.facebook.com/v23.0/10000000001/messages');
  assert.equal(f.sent[0].body.to, CONFIG.userId);
  assert.equal(f.sent[0].body.interactive.body.text, formatRequest(r));
  assert.deepEqual(f.sent[0].body.interactive.action.buttons.map((b) => b.reply.id), [`approve ${r.id}`, `deny ${r.id}`]);
  assert.equal(f.sent[0].options.redirect, 'error');
  assert.equal(f.sent[0].options.headers.Authorization, `Bearer ${CONFIG.token}`);
});
test('Long approvals fall back to complete text, never a truncated button body', async (t) => {
  const f = setup(t); f.receive('START'); const r = await f.request('approval', { message: 'x'.repeat(2000) });
  assert.equal(f.sent[0].body.type, 'text'); assert.equal(f.sent[0].body.text.body, formatRequest(r));
  assert.equal(f.sent[0].body.text.preview_url, false);
});
test('Signed button ID resolves once; displayed button title grants nothing', async (t) => {
  const f = setup(t); f.receive('START'); const r = await f.request();
  const options = { id: 'wamid.one', message: { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: `deny ${r.id}`, title: 'Approve once' } } } };
  f.receive('', options); assert.equal(f.store.get(r.id).status, 'denied');
  f.receive('', options); f.receive(`approve ${r.id}`); assert.equal(f.store.get(r.id).status, 'denied');
});
test('Questions support bilingual answers, not operation approval', async (t) => {
  const f = setup(t); f.receive('START'); const q = await f.request('question');
  f.receive(`approve ${q.id}`); assert.equal(f.store.get(q.id).status, 'pending');
  f.receive(`回答 ${q.id} SQLite`); assert.equal(f.store.get(q.id).answer, 'SQLite');
  const a = await f.request(); f.receive(`answer ${a.id} yes`); f.receive('okay');
  assert.equal(f.store.get(a.id).status, 'pending');
});
test('Unsigned, tampered, or wrong-secret payloads never mutate state', async (t) => {
  const f = setup(t); const e = f.envelope('START'); const before = JSON.stringify(f.store.data);
  for (const signature of ['', 'sha256=abc', 'sha256=' + '0'.repeat(64)]) assert.throws(() => f.channel.handle(e.raw, signature));
  assert.throws(() => f.channel.handle(Buffer.concat([e.raw, Buffer.from(' ')]), e.signature));
  assert.equal(JSON.stringify(f.store.data), before);
});
test('Wrong sender, WABA, business number and group traffic are ignored', async (t) => {
  const f = setup(t); const changes = [
    (p) => { p.entry[0].id = 'wrong'; },
    (p) => { p.entry[0].changes[0].value.metadata.phone_number_id = 'wrong'; },
    (p) => { p.entry[0].changes[0].value.messages[0].from = '15555550999'; },
    (p) => { p.entry[0].changes[0].value.messages[0].group_id = 'group'; },
    (p) => { p.entry[0].changes[0].value.group_id = 'group'; },
  ];
  for (const mutate of changes) f.receive('START', { mutate });
  assert.equal(f.channel.state().optedIn, false); assert.equal(f.channel.state().lastInboundAt, 0);
});
test('Status-only and malformed signed events cannot imply human consent', async (t) => {
  const f = setup(t); f.receive('START'); const r = await f.request();
  f.receive('', { mutate: (p) => { const v = p.entry[0].changes[0].value; delete v.messages; v.statuses = [{ status: 'read', id: 'wamid.out.1' }]; } });
  f.receive(`approve ${r.id}`, { message: { timestamp: 'not-a-timestamp' } });
  f.receive(`approve ${r.id}`, { message: { type: 'image' } });
  assert.equal(f.store.get(r.id).status, 'pending');
});
test('Expired windows fail with explicit code, and stale retries cannot reopen them', async (t) => {
  const f = setup(t); const old = f.envelope('START'); f.channel.handle(old.raw, old.signature);
  f.time.ms += 86400000;
  const r = await f.request(); assert.equal(r.deliveries.whatsapp.code, 'whatsapp_window_closed');
  f.channel.handle(old.raw, old.signature);
  assert.equal((await f.request()).deliveries.whatsapp.code, 'whatsapp_window_closed');
  f.receive('hello'); assert.equal((await f.request()).deliveries.whatsapp.status, 'sent');
});
test('Future timestamps and old START cannot defeat STOP', async (t) => {
  const f = setup(t); const old = f.envelope('START'); f.channel.handle(old.raw, old.signature);
  f.time.ms += 2000; f.receive('STOP');
  f.channel.handle(old.raw, old.signature);
  f.receive('START', { message: { timestamp: String(Math.floor(f.time.ms / 1000) + 3600) } });
  assert.equal(f.channel.state().optedIn, false);
  f.receive('hello'); assert.equal((await f.request()).deliveries.whatsapp.code, 'whatsapp_opt_in_required');
  f.time.ms += 1000; f.receive('START'); assert.equal((await f.request()).deliveries.whatsapp.status, 'sent');
});
test('Request expiry and missing successful delivery both deny approval', async (t) => {
  const f = setup(t); f.receive('START'); const r = await f.request('approval', { ttlSeconds: 1 });
  f.time.ms += 1000; f.receive(`approve ${r.id}`); assert.equal(f.store.get(r.id).status, 'expired');
  const r2 = await f.request(); f.store.patch(r2.id, { deliveries: { whatsapp: { status: 'failed' } } });
  f.receive(`approve ${r2.id}`); assert.equal(f.store.get(r2.id).status, 'pending');
});
test('All three channels share one decision; another channel cannot repeat it', async (t) => {
  const f = setup(t); f.receive('START'); const r = await f.request('approval', { channels: ['telegram', 'weixin', 'whatsapp'] });
  assert.equal(Object.keys(r.deliveries).length, 3);
  f.receive(`批准 ${r.id}`); assert.equal(f.store.get(r.id).status, 'approved');
  assert.throws(() => f.relay.receive('telegram', `deny ${r.id}`, { userId: 'owner' }), /already approved/);
});
test('Telegram decision wins before late WhatsApp reply; wrong channel stays pending', async (t) => {
  const f = setup(t); f.receive('START'); const r = await f.request('approval', { channels: ['telegram', 'whatsapp'] });
  f.relay.receive('telegram', `deny ${r.id}`, { userId: 'owner' }); f.receive(`approve ${r.id}`);
  assert.equal(f.store.get(r.id).status, 'denied');
  const r2 = await f.request('approval', { channels: ['telegram'] }); f.receive(`approve ${r2.id}`);
  assert.equal(f.store.get(r2.id).status, 'pending');
});
test('Restart preserves consent and replay IDs, cancels pending requests', async (t) => {
  const f = setup(t); f.receive('START'); const r = await f.request(); f.store.close();
  const store = new Store(path.join(f.dir, 'state.json'), () => f.time.ms);
  const channel = new WhatsApp({ ...CONFIG, store, now: () => f.time.ms });
  assert.equal(channel.state().optedIn, true); assert.ok(Object.keys(channel.state().seen).length);
  const e = f.envelope(`approve ${r.id}`); channel.handle(e.raw, e.signature);
  assert.equal(store.get(r.id).status, 'cancelled'); store.close();
});
test('Provider HTTP/business errors and timeouts stay redacted and never mark sent', async (t) => {
  for (const fetchImpl of [
    async () => { throw Error(`secret ${CONFIG.token}`); },
    async () => ({ ok: false, json: async () => ({ error: { message: CONFIG.token } }) }),
    async () => ({ ok: true, json: async () => ({ error: { code: 131047 } }) }),
    async () => ({ ok: true, json: async () => ({ messages: [{ id: 'not-trusted' }] }) }),
  ]) {
    const f = setup(t, fetchImpl); f.receive('START'); const r = await f.request('notification');
    assert.equal(r.status, 'failed'); assert.ok(!JSON.stringify(r).includes(CONFIG.token));
  }
});
test('Invalid or insecure Graph versions cannot redirect credentials', (t) => {
  const f = setup(t);
  for (const graphVersion of ['', 'https://evil.example', 'v23.0/../../evil', undefined]) {
    assert.throws(() => new WhatsApp({ ...CONFIG, store: f.store, graphVersion }));
  }
});
test('State-write failure rolls back consent and replay marker and asks for retry', (t) => {
  const f = setup(t); const original = f.store.save;
  f.store.save = () => { throw Error('disk failure'); };
  assert.throws(() => f.receive('START'), /disk failure/);
  assert.equal(f.channel.state().optedIn, false); assert.equal(Object.keys(f.channel.state().seen).length, 0);
  f.store.save = original; f.receive('START'); assert.equal(f.channel.state().optedIn, true);
});
test('Webhook GET challenge, signed POST, API isolation and body limits', async (t) => {
  const f = setup(t); const server = makeWhatsAppWebhookServer(f.channel);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const url = `${base}/webhooks/whatsapp`;
  let res = await fetch(`${url}?hub.mode=subscribe&hub.verify_token=${CONFIG.verifyToken}&hub.challenge=123456`);
  assert.equal(res.status, 200); assert.equal(await res.text(), '123456');
  res = await fetch(`${url}?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=123456`); assert.equal(res.status, 403);
  const e = f.envelope('START');
  res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': e.signature }, body: e.raw });
  assert.equal(res.status, 200); assert.equal(f.channel.state().optedIn, true);
  res = await fetch(`${base}/v1/requests`); assert.equal(res.status, 404);
  res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: e.raw }); assert.equal(res.status, 401);
  res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': e.signature }, body: 'x'.repeat(262145) }); assert.equal(res.status, 413);
});
test('Actual HTTP callback resolves a real persisted request read by a waiting caller', async (t) => {
  const f = setup(t); f.receive('START'); const r = await f.request();
  const server = makeWhatsAppWebhookServer(f.channel);
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); t.after(() => new Promise((r) => server.close(r)));
  const e = f.envelope(`approve ${r.id}`);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/webhooks/whatsapp`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': e.signature }, body: e.raw });
  assert.equal(response.status, 200);
  assert.equal(f.store.get(r.id).status, 'approved');
  assert.equal(JSON.parse(fs.readFileSync(f.store.file, 'utf8')).requests[r.id].status, 'approved');
});
