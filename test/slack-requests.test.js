import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { slackRequestCommand } from '../skills/donerelay/scripts/runtime/slack-requests.js';
import { uninstallLocal } from '../skills/donerelay/scripts/runtime/local.js';
const base = { kind: 'approval', task: 'Disposable test', message: 'Create marker.txt in the disposable project.', connectionId: 'host-slack',
  identity: { workspaceId: 'T123', userId: 'U123', isBot: false }, conversation: { workspaceId: 'T123', channelId: 'D123', isIm: true, isMpim: false, membersComplete: true, members: ['U123'] }, capabilities: { readThread: true, rawMessages: true } };
const start = 1789370000000;
const ts = ms => `${Math.floor(ms / 1000)}.${String(ms % 1000 * 1000).padStart(6, '0')}`;
async function fixture(t, override = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'donerelay-slack-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const env = { DONERELAY_HOME: home };
  let now = start;
  let session;
  const call = (command, input = {}) => slackRequestCommand(command, { sessionId: session?.sessionId, ...input }, { env, now });
  session = await call('open', { workflowId: 'workflow-1' });
  const r = await call('create', { ...base, ...override });
  const receipt = { connectionId: 'host-slack', workspaceId: 'T123', channelId: 'D123', ok: true, ts: ts(start) };
  await call('sent', { id: r.id, receipt });
  now += 1000;
  const parent = { type: 'message', user: 'U123', ts: receipt.ts, text: r.prepared.message.text };
  const reply = (text, extra = {}) => ({ type: 'message', user: 'U123', ts: ts(start + 500), thread_ts: receipt.ts, text, ...extra });
  const snapshot = (messages, extra = {}) => ({ connectionId: 'host-slack', workspaceId: 'T123', channelId: 'D123', threadTs: receipt.ts, complete: true, messages: [parent, ...messages], ...extra });
  return { home, env, r, call, receipt, parent, reply, snapshot, session, advance: ms => { now += ms; } };
}

test('same caller continues exactly once after explicit bound approval', async t => {
  const f = await fixture(t);
  const marker = path.join(f.home, 'marker.txt');
  const waitingCaller = async () => {
    const observed = await f.call('ingest', { id: f.r.id, snapshot: f.snapshot([f.reply('approve')]) });
    assert.equal(observed.status, 'approved'); assert.equal(observed.mayExecute, false);
    const decision = await f.call('take', { id: f.r.id, binding: f.r.binding });
    if (decision.mayExecute) fs.writeFileSync(marker, 'approved');
  };
  await waitingCaller(); assert.equal(fs.readFileSync(marker, 'utf8'), 'approved');
  await assert.rejects(f.call('take', { id: f.r.id, binding: f.r.binding }), /consumed/);
  assert.equal((await f.call('get', { id: f.r.id })).mayExecute, false);
  assert.equal(fs.statSync(path.join(f.home, 'slack.json')).mode & 0o777, 0o600);
  assert.equal(fs.existsSync(path.join(f.home, 'config.json')), false);
});
for (const kind of ['denial', 'timeout', 'question']) test(`${kind} cannot execute an operation`, async t => {
  const f = await fixture(t, kind === 'question' ? { kind: 'question' } : {});
  if (kind === 'timeout') f.advance(601000);
  const observed = await f.call('ingest', { id: f.r.id, snapshot: f.snapshot([f.reply(kind === 'denial' ? 'deny' : 'approve')]) });
  assert.equal(observed.status, { denial: 'denied', timeout: 'expired', question: 'answered' }[kind]);
  if (kind === 'question') assert.equal(observed.answer, 'approve');
  assert.equal((await f.call('take', { id: f.r.id, binding: f.r.binding })).mayExecute, false);
});
test('wrong author, bot, edited, wrong thread, vague and late messages never approve', async t => {
  const f = await fixture(t);
  for (const [text, fields] of [['approve', { user: 'U999' }], ['approve', { bot_id: 'B123' }], ['approve', { app_id: 'A123' }], ['approve', { edited: { ts: ts(start) } }], ['approve', { subtype: 'bot_message' }], ['approve', { thread_ts: ts(start - 1) }], ['okay', {}], ['approve ABCDEF123456', {}], ['approve', { ts: ts(start + 900000) }], ['approve', { ts: ts(start - 1) }]]) {
    assert.equal((await f.call('ingest', { id: f.r.id, snapshot: f.snapshot([f.reply(text, fields)]) })).status, 'pending');
  }
});
test('routing, incomplete pages and contradictory snapshots fail closed', async t => {
  const f = await fixture(t);
  for (const patch of [{ connectionId: 'other' }, { workspaceId: 'T999' }, { channelId: 'D999' }, { threadTs: ts(start - 1) }, { complete: false }, { has_more: true }, { response_metadata: { next_cursor: 'more' } }, { messages: [f.reply('approve')] }]) {
    await assert.rejects(f.call('ingest', { id: f.r.id, snapshot: f.snapshot([f.reply('approve')], patch) }));
    assert.equal((await f.call('get', { id: f.r.id })).status, 'pending');
  }
  await assert.rejects(f.call('ingest', { id: f.r.id, snapshot: f.snapshot([f.reply('approve'), f.reply('deny')]) }), /Conflicting/);
});
test('modified original cancels and duplicate replies cannot change first decision', async t => {
  const f = await fixture(t);
  const denial = f.reply('deny');
  let r = await f.call('ingest', { id: f.r.id, snapshot: f.snapshot([f.reply('approve', { ts: ts(start + 600) }), denial, denial]) });
  assert.equal(r.status, 'denied');
  r = await f.call('ingest', { id: f.r.id, snapshot: f.snapshot([f.reply('approve')]) });
  assert.equal(r.status, 'denied');
  const g = await fixture(t);
  g.parent.text = 'changed proposal';
  assert.equal((await g.call('ingest', { id: g.r.id, snapshot: g.snapshot([g.reply('approve')]) })).status, 'cancelled');
});
test('numbered and Chinese explicit decisions work', async t => {
  for (const word of ['批准', '拒绝', 'approve']) {
    const f = await fixture(t, { language: 'zh' });
    const message = word === 'approve' ? `approve ${f.r.id}` : word;
    assert.equal((await f.call('ingest', { id: f.r.id, snapshot: f.snapshot([f.reply(message)]) })).status, word === '拒绝' ? 'denied' : 'approved');
  }
});
test('restart, close and deadline invalidate unconsumed approvals', async t => {
  for (const action of ['restart', 'close', 'expire']) {
    const f = await fixture(t);
    await f.call('ingest', { id: f.r.id, snapshot: f.snapshot([f.reply('approve')]) });
    if (action === 'expire') {
      f.advance(601000);
      assert.equal((await f.call('take', { id: f.r.id, binding: f.r.binding })).mayExecute, false);
    } else {
      const next = await f.call(action === 'restart' ? 'open' : 'close', { workflowId: 'workflow-1' });
      await assert.rejects(f.call('take', { id: f.r.id, binding: f.r.binding }), /closed/);
      if (action === 'restart') await assert.rejects(f.call('get', { sessionId: next.sessionId, id: f.r.id }), /belong/);
    }
  }
});
test('binding and concurrent single-use consumption', async t => {
  const f = await fixture(t);
  await f.call('ingest', { id: f.r.id, snapshot: f.snapshot([f.reply('approve')]) });
  await assert.rejects(f.call('take', { id: f.r.id, binding: 'changed' }), /binding/);
  const outcomes = await Promise.allSettled([1, 2].map(() => f.call('take', { id: f.r.id, binding: f.r.binding })));
  assert.equal(outcomes.filter(r => r.status === 'fulfilled' && r.value.mayExecute).length, 1);
});
test('delivery cannot rebind; missing reader and wrong sessions rejected', async t => {
  const f = await fixture(t);
  await assert.rejects(f.call('sent', { id: f.r.id, receipt: f.receipt }), /bound/);
  await assert.rejects(f.call('create', { ...base, capabilities: {} }), /thread reads/);
  const other = await f.call('open', { workflowId: 'different-workflow' });
  await assert.rejects(f.call('get', { sessionId: other.sessionId, id: f.r.id }), /belong/);
});
test('copied skill helper persists across processes without Telegram setup', async t => {
  const f = await fixture(t);
  const skill = path.join(f.home, 'copied-skill');
  fs.cpSync('skills/donerelay', skill, { recursive: true });
  const cli = (cmd, input) => JSON.parse(execFileSync(process.execPath, [path.join(skill, 'scripts/relay.mjs'), 'slack', cmd], { env: { ...process.env, ...f.env }, input: JSON.stringify(input), encoding: 'utf8' }));
  const s = cli('open', { workflowId: 'actual-process-test' });
  const r = cli('create', { ...base, sessionId: s.sessionId });
  assert.equal(cli('get', { sessionId: s.sessionId, id: r.id }).binding, r.binding);
  assert.equal(cli('close', { sessionId: s.sessionId }).status, 'closed');
  assert.equal(fs.existsSync(path.join(f.home, 'runtime.json')), false);
});
test('uninstall preserves active Slack decisions and purges closed history', async t => {
  // Use wall clock here because uninstall checks real deadlines.
  const f = await fixture(t);
  await f.call('close');
  const s = await slackRequestCommand('open', { workflowId: 'live' }, { env: f.env });
  await slackRequestCommand('create', { ...base, sessionId: s.sessionId }, { env: f.env });
  await assert.rejects(uninstallLocal(f.env, { purge: true }), /Close outstanding Slack/);
  await slackRequestCommand('close', { sessionId: s.sessionId }, { env: f.env });
  await uninstallLocal(f.env, { purge: true });
  assert.equal(fs.existsSync(path.join(f.home, 'slack.json')), false);
});
test('persistence failure returns no execution grant', async t => {
  const f = await fixture(t);
  await f.call('ingest', { id: f.r.id, snapshot: f.snapshot([f.reply('approve')]) });
  const rename = fs.renameSync;
  fs.renameSync = () => { throw new Error('simulated failed commit'); };
  try { await assert.rejects(f.call('take', { id: f.r.id, binding: f.r.binding }), /failed commit/); }
  finally { fs.renameSync = rename; }
  assert.equal((await f.call('get', { id: f.r.id })).consumedAt, undefined);
  assert.equal((await f.call('take', { id: f.r.id, binding: f.r.binding })).mayExecute, true);
});
test('unbound, failed and wrong delivery receipts cannot approve', async t => {
  const f = await fixture(t);
  const r = await f.call('create', { ...base });
  await assert.rejects(f.call('take', { id: r.id, binding: r.binding }), /pending/);
  assert.equal((await f.call('ingest', { id: r.id, snapshot: f.snapshot([f.reply('approve')]) })).status, 'prepared');
  await assert.rejects(f.call('sent', { id: r.id, receipt: { ...f.receipt, workspaceId: 'T999' } }), /workspace/);
  await assert.rejects(f.call('sent', { id: r.id, receipt: f.receipt }), /already bound/);
  assert.equal((await f.call('sent', { id: r.id, receipt: { ...f.receipt, ok: false } })).status, 'failed');
  assert.equal((await f.call('take', { id: r.id, binding: r.binding })).mayExecute, false);
});
