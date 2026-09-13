import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';
import { Relay, formatRequest } from '../src/relay.js';
import { parseReply } from '../src/util.js';
import { makeServer } from '../src/server.js';
import { Client } from '../src/client.js';

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'donerelay-'));
  const file = path.join(dir, 'state.json'); let now = 100000;
  const store = new Store(file, () => now);
  const sent = [];
  const channel = { authorize: (a) => a.userId === 'owner' && a.private === true, send: async (text, r) => sent.push({ text, id: r.id }) };
  const relay = new Relay(store, { telegram: channel, weixin: channel }, () => now);
  t.after(() => { store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { store, relay, sent, file, advance: (ms) => { now += ms; } };
}
const actor = { userId: 'owner', private: true };
const approval = { kind: 'approval', task: 'deploy staging', message: 'Deploy exactly commit abc123 to staging, not production.' };

test('strict bilingual reply parser rejects vague, extra, and unbound approvals', () => {
  assert.equal(parseReply('okay'), null);
  assert.equal(parseReply('approve abcdef012345 anything'), null);
  assert.equal(parseReply('answer abcdef012345'), null);
  assert.deepEqual(parseReply('批准 abcdef012345'), { action: 'approve', id: 'ABCDEF012345', answer: undefined });
  assert.equal(parseReply('回答 ABCDEF012345 先用 SQLite').answer, '先用 SQLite');
});
test('both channels share one immutable, single-use approval', async (t) => {
  const { relay, store, sent } = setup(t);
  const r = await relay.create(approval);
  assert.equal(sent.length, 2);
  assert.equal(store.get(r.id).binding.length, 64);
  assert.equal(relay.receive('telegram', `approve ${r.id}`, actor).status, 'approved');
  assert.throws(() => relay.receive('weixin', `批准 ${r.id}`, actor), /already approved/);
  assert.throws(() => relay.receive('telegram', `deny ${r.id}`, actor), /already approved/);
});
test('unauthorized user and group messages cannot approve', async (t) => {
  const { relay, store } = setup(t); const r = await relay.create(approval);
  for (const bad of [{ ...actor, userId: 'attacker' }, { ...actor, private: false }]) {
    assert.throws(() => relay.receive('telegram', `approve ${r.id}`, bad), /not authorized/);
  }
  assert.equal(store.get(r.id).status, 'pending');
});
test('a request cannot be approved through a channel it was not sent to', async (t) => {
  const { relay } = setup(t); const r = await relay.create({ ...approval, channels: ['telegram'] });
  assert.throws(() => relay.receive('weixin', `approve ${r.id}`, actor), /not sent/);
});
test('question answers never grant operation approvals', async (t) => {
  const { relay } = setup(t);
  const r = await relay.create({ kind: 'question', task: 'storage', message: 'SQLite or PostgreSQL?' });
  assert.throws(() => relay.receive('telegram', `approve ${r.id}`, actor), /does not match/);
  const result = relay.receive('weixin', `回答 ${r.id} SQLite`, actor);
  assert.equal(result.status, 'answered'); assert.equal(result.answer, 'SQLite');
  const a = await relay.create(approval);
  assert.throws(() => relay.receive('telegram', `answer ${a.id} yes`, actor), /does not match/);
});
test('expiry is checked at decision time, without relying on the sweeper', async (t) => {
  const { relay, store, advance } = setup(t); const r = await relay.create({ ...approval, ttlSeconds: 1 });
  advance(1000);
  assert.throws(() => relay.receive('telegram', `approve ${r.id}`, actor), /expired/);
  assert.equal(store.get(r.id).status, 'expired');
});
test('restart cancels pending requests and never replays an old approval', async (t) => {
  const { relay, store, file } = setup(t); const r = await relay.create(approval);
  store.close(); const reopened = new Store(file);
  try { assert.equal(reopened.get(r.id).status, 'cancelled'); assert.equal(reopened.get(r.id).reason, 'service_restarted'); }
  finally { reopened.close(); }
});
test('one process per state file and private state permissions', (t) => {
  const { file } = setup(t);
  assert.throws(() => new Store(file), /locked/);
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});
test('idempotency does not resend and detects content mismatch', async (t) => {
  const { relay, sent } = setup(t);
  const r = await relay.create({ ...approval, idempotencyKey: 'build-1' });
  const again = await relay.create({ ...approval, idempotencyKey: 'build-1' });
  assert.equal(r.id, again.id); assert.equal(sent.length, 2);
  await assert.rejects(relay.create({ ...approval, message: 'Something else', idempotencyKey: 'build-1' }), /different content/);
});
test('failed notification delivery is reported, not called sent', async (t) => {
  const { store } = setup(t);
  const relay = new Relay(store, { telegram: { send: async () => { throw Error('secret-token'); } } });
  const r = await relay.create({ kind: 'notification', task: 'build', message: 'Done' });
  assert.equal(r.status, 'failed'); assert.equal(JSON.stringify(r).includes('secret-token'), false);
});
test('oversize or misleading control characters in proposals fail closed', async (t) => {
  const { relay } = setup(t);
  await assert.rejects(relay.create({ ...approval, message: 'a'.repeat(2001) }), /at most/);
  await assert.rejects(relay.create({ ...approval, message: '\u202edanger' }), /control/);
  await assert.rejects(relay.create({ ...approval, ttlSeconds: 0 }), /ttlSeconds/);
  await assert.rejects(relay.create({ ...approval, channels: ['unknown'] }), /configured/);
});
test('approval display includes the complete proposal and exact request id', async (t) => {
  const { relay } = setup(t); const r = await relay.create(approval); const formatted = formatRequest(r);
  assert.ok(formatted.includes(approval.message)); assert.ok(formatted.includes(`approve ${r.id}`));
});
test('HTTP API requires auth and does not expose a remote approval endpoint', async (t) => {
  const { relay } = setup(t); const token = 'test-local-secret-'.repeat(4);
  const server = makeServer(relay, token);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${origin}/healthz`)).status, 200);
  assert.equal((await fetch(`${origin}/v1/requests/ABCDEF012345`)).status, 401);
  const client = new Client({ DONERELAY_API_TOKEN: token, DONERELAY_URL: origin });
  const r = await client.create(approval);
  assert.equal((await client.get(r.id)).status, 'pending');
  const noApprove = await fetch(`${origin}/v1/requests/${r.id}/approve`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  assert.equal(noApprove.status, 404);
  const malformed = await fetch(`${origin}/v1/requests`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  assert.equal((await client.cancel(r.id)).status, 'cancelled');
});
test('client rejects insecure remote origins and credentials embedded in URLs', () => {
  const env = { DONERELAY_API_TOKEN: 'x'.repeat(32) };
  for (const url of ['http://example.com', 'https://user:password@example.com', 'https://example.com/path']) {
    assert.throws(() => new Client({ ...env, DONERELAY_URL: url }), /HTTPS or loopback/);
  }
});
test('a failed channel delivery cannot grant approval even from its bound user', async (t) => {
  const {store}=setup(t);
  const relay=new Relay(store,{telegram:{authorize:()=>true,send:async()=>{throw Error('provider failed')}}});
  const r=await relay.create({...approval,channels:['telegram']});
  assert.equal(r.deliveries.telegram.status,'failed');
  assert.throws(()=>relay.receive('telegram',`approve ${r.id}`,actor),/delivery is not confirmed/);
  assert.equal(store.get(r.id).status,'pending');
});
