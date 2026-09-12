import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';
import { Relay } from '../src/relay.mjs';
import { createApi } from '../src/server.mjs';
import { CodexSession, childEnvironment } from '../src/adapters/codex.mjs';
import { RelayClient } from '../skills/donerelay/scripts/relay.mjs';

test('Codex child cannot inherit messaging or relay credentials', () => {
  assert.deepEqual(childEnvironment({ PATH: '/bin', OPENAI_API_KEY: 'user-key', TELEGRAM_BOT_TOKEN: 'secret', WEIXIN_TOKEN: 'secret', DONERELAY_API_TOKEN: 'secret' }),
    { PATH: '/bin', OPENAI_API_KEY: 'user-key' });
});
test('missing command details and oversized actions are denied without sending a card', async () => {
  const session = new CodexSession({ client: {}, cwd: '.', prompt: 'test' }); session.threadId = 't';
  const base = { id: 1, method: 'item/commandExecution/requestApproval', params: { threadId: 't', turnId: 'u' } };
  assert.equal((await session.handleRequest(base, new AbortController())).decision, 'decline');
  assert.equal((await session.handleRequest({ ...base, params: { ...base.params, command: 'x'.repeat(3000) } }, new AbortController())).decision, 'decline');
});
test('requests from another Codex thread fail closed', async () => {
  const session = new CodexSession({ client: {}, cwd: '.', prompt: 'test' }); session.threadId = 't';
  await assert.rejects(session.handleRequest({ method: 'item/commandExecution/requestApproval', params: { threadId: 'wrong', turnId: 'u' } }, new AbortController()));
});
test('extra permission grants and MCP elicitation default to denial', async () => {
  const session = new CodexSession({ client: {}, cwd: '.', prompt: 'test' }); session.threadId = 't';
  const params = { threadId: 't', turnId: 'u' };
  assert.deepEqual(await session.handleRequest({ method: 'item/permissions/requestApproval', params }, new AbortController()), { permissions: {}, scope: 'turn' });
  assert.equal((await session.handleRequest({ method: 'mcpServer/elicitation/request', params }, new AbortController())).action, 'decline');
});
test('secret input interrupts locally instead of relaying the question', async () => {
  const session = new CodexSession({ client: {}, cwd: '.', prompt: 'test' }); session.threadId = 't'; let interrupted = false;
  session.interrupt = async () => { interrupted = true; };
  const result = await session.handleRequest({ method: 'item/tool/requestUserInput', params: { threadId: 't', turnId: 'u', questions: [{ id: 'secret', isSecret: true }] } }, new AbortController());
  assert.deepEqual(result, { answers: {} }); assert.equal(interrupted, true);
});
test('full simulated Codex -> HTTP -> approval -> question -> same-thread continuation', { timeout: 8000 }, async t => {
  const store = new Store(); let relay, sent = 0, created = [];
  const channel = { name: 'test', authorized: e => e.userId === 'owner', clear: async () => {},
    async send(text, r) {
      if (r) {
        created.push(r);
        setTimeout(() => relay.receive('test', { userId: 'owner', text: r.kind === 'approval' ? `approve ${r.id}` : `reply ${r.id} SQLite` }), 5);
      }
      return ++sent;
    } };
  relay = new Relay(store, [channel]);
  const token = 'test-token-'.repeat(4), server = createApi(relay, token);
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  t.after(async () => { await new Promise(ok => { server.close(ok); server.closeAllConnections(); }); store.close(); });
  const client = new RelayClient({ token, url: `http://127.0.0.1:${server.address().port}` });
  const session = new CodexSession({ client, cwd: process.cwd(), prompt: 'test', bin: process.execPath,
    args: [fileURLToPath(new URL('./fixtures/codex-server.mjs', import.meta.url))], onOutput: () => {} });
  const result = await session.run();
  assert.equal(result.status, 'completed'); assert.equal(result.threadId, 'thread-test');
  assert.equal(created.length, 2);
  assert.ok(created.every(r => r.context.threadId === 'thread-test' && r.context.turnId === 'turn-test'));
});

test('missing Codex executable fails promptly rather than hanging on initialization', { timeout: 3000 }, async () => {
  const session = new CodexSession({ client: {}, cwd: process.cwd(), prompt: 'test', bin: '/no/such/donerelay-test-binary' });
  await assert.rejects(session.run(), /Cannot start Codex/);
});
