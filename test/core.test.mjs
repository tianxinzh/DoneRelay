import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.mjs';
import { Relay } from '../src/relay.mjs';
import { createApi } from '../src/server.mjs';
import { RelayClient } from '../skills/donerelay/scripts/relay.mjs';

const approval = { kind: 'approval', taskId: 'site', title: 'Deploy staging', action: 'deploy --environment staging' };
const question = { kind: 'question', taskId: 'site', title: 'Database', question: 'SQLite or PostgreSQL?' };
function channel(name = 'telegram') {
  return { name, sent: [], cleared: [], authorized: e => e.private === true && e.userId === 'owner',
    async send(body, r) { this.sent.push({ body, r }); return this.sent.length; },
    async clear(id) { this.cleared.push(id); } };
}
const event = text => ({ private: true, userId: 'owner', text });
function setup(t, options) {
  const store = new Store(':memory:', options), a = channel(), b = channel('weixin');
  const relay = new Relay(store, [a, b]); t.after(() => store.close()); return { store, relay, a, b };
}

test('approval binds immutable task/action digest', t => {
  const { store } = setup(t); const r = store.create(approval);
  assert.equal(r.status, 'pending'); assert.equal(r.action, approval.action); assert.equal(r.digest.length, 64);
  const x = store.resolve(r.id, { type: 'approve' }, 'owner');
  assert.equal(x.status, 'approved'); assert.equal(x.response.digest, r.digest);
});
test('unknown kind and missing title are rejected', t => {
  const { store } = setup(t);
  assert.throws(() => store.create({ ...approval, kind: 'execute' }));
  assert.throws(() => store.create({ ...approval, title: '' }));
});
test('oversized approval is rejected, never silently truncated', t => {
  const { store } = setup(t);
  assert.throws(() => store.create({ ...approval, action: 'x'.repeat(2601) }));
});
test('bidirectional text controls are rejected', t => {
  const { store } = setup(t); assert.throws(() => store.create({ ...approval, action: 'abc\u202edef' }));
});
test('bad TTL and unrecognized context are rejected', t => {
  const { store } = setup(t);
  for (const ttlSeconds of [0, -1, 86401, NaN, 1.5]) assert.throws(() => store.create({ ...approval, ttlSeconds }));
  assert.throws(() => store.create({ ...approval, context: { malicious: 'no' } }));
});
test('question answers never authorize an operation', t => {
  const { store } = setup(t), r = store.create(approval);
  assert.throws(() => store.resolve(r.id, { type: 'reply', text: 'yes' }, 'owner'));
  assert.equal(store.get(r.id).status, 'pending');
});
test('choice questions reject answers outside explicit choices', t => {
  const { store } = setup(t), r = store.create({ ...question, choices: ['SQLite', 'PostgreSQL'] });
  assert.throws(() => store.resolve(r.id, { type: 'reply', text: 'yes' }, 'owner'));
  assert.equal(store.resolve(r.id, { type: 'reply', text: 'SQLite' }, 'owner').response.answer, 'SQLite');
});
test('a decision can only be applied once across channels', async t => {
  const { store, relay, a, b } = setup(t), r = await relay.create(approval);
  await relay.receive('telegram', event(`approve ${r.id}`));
  await relay.receive('weixin', event(`拒绝 ${r.id}`));
  assert.equal(store.get(r.id).status, 'approved'); assert.equal(a.cleared.length, 1); assert.equal(b.cleared.length, 1);
});
test('unbound yes does not guess the target task', async t => {
  const { store, relay } = setup(t), a = await relay.create(approval), b = await relay.create(question);
  await relay.receive('telegram', event('yes'));
  assert.equal(store.get(a.id).status, 'pending'); assert.equal(store.get(b.id).status, 'pending');
});
test('unauthorized sender and group cannot approve', async t => {
  const { store, relay } = setup(t), r = await relay.create(approval);
  assert.equal(await relay.receive('telegram', { ...event(`approve ${r.id}`), userId: 'intruder' }), false);
  assert.equal(await relay.receive('telegram', { ...event(`approve ${r.id}`), private: false }), false);
  assert.equal(store.get(r.id).status, 'pending');
});
test('callback nonce and message binding must both match', async t => {
  const { store, relay } = setup(t), r = await relay.create(approval);
  await relay.receive('telegram', { ...event(), messageId: 1, callback: `dr:a:${r.id}:0000000000000000` });
  await relay.receive('telegram', { ...event(), messageId: 999, callback: `dr:a:${r.id}:${r.nonce}` });
  assert.equal(store.get(r.id).status, 'pending');
  await relay.receive('telegram', { ...event(), messageId: 1, callback: `dr:a:${r.id}:${r.nonce}` });
  assert.equal(store.get(r.id).status, 'approved');
});
test('Telegram native reply reaches only the matching question', async t => {
  const { store, relay } = setup(t), r = await relay.create(question);
  await relay.receive('telegram', { ...event('Use SQLite, no deployment.'), replyTo: 1 });
  assert.equal(store.get(r.id).response.answer, 'Use SQLite, no deployment.');
});
test('Chinese explicit replies and approvals work', async t => {
  const { store, relay } = setup(t), q = await relay.create(question), r = await relay.create(approval);
  await relay.receive('weixin', event(`回复 ${q.id} 先用 SQLite`));
  await relay.receive('weixin', event(`批准 ${r.id}`));
  assert.equal(store.get(q.id).status, 'answered'); assert.equal(store.get(r.id).status, 'approved');
});
test('trailing ambiguous approval text is rejected', async t => {
  const { store, relay } = setup(t), r = await relay.create(approval);
  await relay.receive('telegram', event(`approve ${r.id} but not production`));
  assert.equal(store.get(r.id).status, 'pending');
});
test('expiry at exact deadline fails closed', t => {
  let time = 1000; const { store } = setup(t, { clock: () => time });
  const r = store.create({ ...approval, ttlSeconds: 1 }); time = 2000;
  assert.equal(store.get(r.id).status, 'expired'); assert.throws(() => store.resolve(r.id, { type: 'approve' }, 'owner'));
});
test('cancel invalidates an already recorded but not forwarded approval', t => {
  const { store } = setup(t), r = store.create(approval);
  store.resolve(r.id, { type: 'approve' }, 'owner'); store.cancel(r.id);
  assert.equal(store.get(r.id).status, 'cancelled'); assert.equal(store.get(r.id).response, null);
});
test('restart cancels stale permissions and preserves cursors; parallel stores refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'donerelay-')), path = join(dir, 'state.sqlite');
  let store;
  try {
    store = new Store(path); const r = store.create(approval);
    store.setState('telegram:offset', 42);
    assert.throws(() => new Store(path), /locked/);
    if (process.platform !== 'win32') assert.equal(statSync(path).mode & 0o777, 0o600);
    store.close(); store = new Store(path);
    assert.equal(store.get(r.id).status, 'cancelled'); assert.equal(store.getState('telegram:offset'), 42);
  } finally { store?.close(); rmSync(dir, { recursive: true, force: true }); }
});
test('a failed channel does not block delivery to the other channel', async t => {
  const { relay, b } = setup(t); b.send = async () => { throw new Error('no context'); };
  const r = await relay.create(approval);
  assert.deepEqual(r.deliveries.map(d => d.status), ['sent', 'failed']);
});
test('API rejects absent auth, browser origins, and a fabricated approve endpoint', async t => {
  const { relay } = setup(t), token = 's'.repeat(32), server = createApi(relay, token);
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  t.after(() => new Promise(ok => { server.close(ok); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${url}/healthz`)).status, 200);
  assert.equal((await fetch(`${url}/v1/requests`)).status, 401);
  assert.equal((await fetch(`${url}/v1/requests`, { headers: { Authorization: `Bearer ${token}`, Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await fetch(`${url}/v1/approve`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })).status, 404);
  const client = new RelayClient({ url, token });
  const r = await client.create(approval);
  await relay.receive('telegram', event(`approve ${r.id}`));
  assert.equal((await client.wait(r)).status, 'approved');
});
test('client refuses plaintext remote endpoint and short API token', () => {
  assert.throws(() => new RelayClient({ url: 'http://external.example', token: 'a'.repeat(32) }));
  assert.throws(() => new RelayClient({ token: 'short' }));
});

test('recorded approval is unusable after its deadline', t => {
  let time = 1000; const { store } = setup(t, { clock: () => time });
  const r = store.create({ ...approval, ttlSeconds: 1 });
  store.resolve(r.id, { type: 'approve' }, 'owner'); time = 2000;
  assert.equal(store.get(r.id).status, 'expired'); assert.equal(store.get(r.id).response, null);
});
test('recipient overrides and ignored security flags are rejected', t => {
  const { store } = setup(t);
  assert.throws(() => store.create({ ...approval, chatId: 'other-person' }));
  assert.throws(() => store.create({ ...question, sensitive: true }));
});
