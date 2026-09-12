import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createInterface } from 'node:readline';
import { approvalInput, questionInput, runCodex } from '../src/adapters/codex.js';
const params = { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', command: 'npm test', cwd: '/work' };

test('Codex mobile approval includes command, cwd, native item, and session', () => {
  const r = approvalInput('item/commandExecution/requestApproval', params);
  assert.equal(r.kind, 'approval'); assert.ok(r.message.includes('npm test')); assert.ok(r.message.includes('/work')); assert.ok(r.task.includes('thread-1'));
});
test('Codex rejects invisible, oversized, or session-wide-only approval proposals', () => {
  assert.throws(() => approvalInput('item/commandExecution/requestApproval', { ...params, command: 'x'.repeat(2200) }), /too large/);
  assert.throws(() => approvalInput('item/commandExecution/requestApproval', { ...params, availableDecisions: ['acceptForSession'] }), /single-operation/);
  assert.throws(() => approvalInput('item/fileChange/requestApproval', params), /inspectable/);
});
test('Codex secret questions must be answered locally', () => {
  assert.throws(() => questionInput({ id: 'q', question: 'Password?', isSecret: true }, params), /secret/);
});
test('Codex owns a live mocked RPC session, waits for approval, and returns accept once', async () => {
  const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough();
  child.kill = () => { child.stdin.end(); child.stdout.end(); return true; };
  const input = createInterface({ input: child.stdin });
  const replies = []; const outgoing = []; let release;
  const emit = (m) => child.stdout.write(`${JSON.stringify(m)}\n`);
  input.on('line', (line) => {
    const m = JSON.parse(line); outgoing.push(m);
    if (m.method === 'initialize') emit({ id: m.id, result: {} });
    if (m.method === 'thread/start') emit({ id: m.id, result: { thread: { id: 'thread-1' } } });
    if (m.method === 'turn/start') {
      emit({ id: m.id, result: { turn: { id: 'turn-1' } } });
      emit({ id: 100, method: 'item/commandExecution/requestApproval', params });
    }
    if (m.id === 100 && m.result) {
      replies.push(m.result);
      emit({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } } });
    }
  });
  const notifications = [];
  const client = {
    async create(r) { if (r.kind === 'notification') notifications.push(r); return { id: 'ABCDEF012345', status: 'pending' }; },
    wait: () => new Promise((resolve) => { release = resolve; }), cancel: async () => ({}),
  };
  const running = runCodex({ prompt: 'Run tests', client, spawnImpl: () => child });
  for (let n = 0; n < 30 && !release; n++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(replies.length, 0); assert.equal(typeof release, 'function');
  release({ status: 'approved' });
  assert.equal((await running).status, 'completed');
  assert.deepEqual(replies, [{ decision: 'accept' }]);
  assert.equal(notifications.length, 1);
  assert.equal(outgoing.some((m) => m.result?.decision === 'acceptForSession'), false);
  input.close();
});
