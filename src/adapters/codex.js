import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { check, RelayError } from '../util.js';

export function approvalInput(method, p, item) {
  check(p?.threadId && p?.turnId && p?.itemId, 'Native approval is missing session identifiers');
  let proposal;
  if (method === 'item/commandExecution/requestApproval') {
    check(p.command || p.networkApprovalContext || item?.command, 'Native command has no inspectable proposal');
    proposal = { command: p.command ?? item?.command, cwd: p.cwd ?? item?.cwd, reason: p.reason,
      networkApprovalContext: p.networkApprovalContext, additionalPermissions: p.additionalPermissions };
    if (p.availableDecisions) check(p.availableDecisions.includes('accept'), 'Native request does not offer single-operation approval');
  } else {
    check(method === 'item/fileChange/requestApproval' && item?.changes, 'File approval has no inspectable changes');
    proposal = { changes: item.changes, grantRoot: p.grantRoot, reason: p.reason };
  }
  const message = `${method}\nItem: ${p.itemId}\n${JSON.stringify(proposal, null, 2)}`;
  check(message.length <= 2000, 'Proposal is too large for complete mobile review; review locally instead');
  return { kind: 'approval', task: `Codex ${p.threadId} / ${p.turnId}`, message };
}
export function questionInput(q, p) {
  check(q?.id && typeof q.question === 'string' && !q.isSecret, 'Unsupported or secret question; answer locally');
  const choices = (q.options ?? []).map((o) => `${o.label}: ${o.description ?? ''}`).join('\n');
  const message = `${q.header ?? 'Question'}\n${q.question}${choices ? `\nOptions (reply with the exact label):\n${choices}` : ''}`;
  check(message.length <= 2000, 'Question is too large for mobile review');
  return { kind: 'question', task: `Codex ${p.threadId} / ${p.turnId}`, message };
}

// Starts its OWN App Server connection. It does not attach to an arbitrary CLI session.
export async function runCodex({ prompt, cwd = process.cwd(), client, command = 'codex', spawnImpl = spawn }) {
  check(typeof prompt === 'string' && prompt.trim(), 'A prompt is required');
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(TELEGRAM_|WEIXIN_|DONERELAY_)/.test(k)));
  const child = spawnImpl(command, ['app-server'], { cwd: path.resolve(cwd), env, stdio: ['pipe', 'pipe', 'inherit'] });
  const rpc = new Map(); const pending = new Map(); const items = new Map();
  let seq = 0; let ended = false; let threadId; let lastMessage = '';
  let resolveDone, rejectDone;
  const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
  done.catch(() => {}); // May reject during initialization, before the main await.
  const send = (msg) => { check(!ended && !child.stdin.destroyed, 'Codex connection closed', 503); child.stdin.write(`${JSON.stringify(msg)}\n`); };
  const call = (method, params) => new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { rpc.delete(id); reject(new RelayError(`Codex ${method} timed out`, 504)); }, 30000);
    rpc.set(id, { resolve, reject, timer });
    try { send({ id, method, params }); } catch (e) { clearTimeout(timer); rpc.delete(id); reject(e); }
  });
  const clearNative = (id) => {
    const entry = pending.get(String(id));
    if (!entry) return;
    entry.controller.abort();
    for (const requestId of entry.ids) void client.cancel(requestId).catch(() => {});
    pending.delete(String(id));
  };
  const failure = () => {
    ended = true;
    for (const entry of rpc.values()) { clearTimeout(entry.timer); entry.reject(new RelayError('Codex process disconnected', 503)); }
    rpc.clear(); for (const key of pending.keys()) clearNative(key);
    rejectDone(new RelayError('Codex process disconnected before completion', 503));
  };
  child.on('error', failure); child.on('exit', failure);
  child.stdin.on('error', failure);
  const handleNative = async (msg) => {
    const p = msg.params ?? {};
    const entry = { controller: new AbortController(), ids: [] };
    pending.set(String(msg.id), entry);
    const ask = async (input) => {
      if (Number.isInteger(p.autoResolutionMs) && p.autoResolutionMs > 0) input.ttlSeconds = Math.max(1, Math.min(86400, Math.floor(p.autoResolutionMs / 1000)));
      const request = await client.create(input, entry.controller.signal);
      entry.ids.push(request.id);
      if (entry.controller.signal.aborted) { await client.cancel(request.id); throw new RelayError('Native request is stale'); }
      return client.wait(request.id, entry.controller.signal);
    };
    let result;
    try {
      check(p.threadId === threadId, 'Native request belongs to another thread');
      if (['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(msg.method)) {
        const r = await ask(approvalInput(msg.method, p, items.get(p.itemId)));
        result = { decision: r.status === 'approved' ? 'accept' : 'decline' };
      } else if (msg.method === 'item/tool/requestUserInput') {
        check(Array.isArray(p.questions) && p.questions.length > 0 && p.questions.length <= 3, 'Invalid native questions');
        const answers = {};
        for (const q of p.questions) {
          const r = await ask(questionInput(q, p));
          check(r.status === 'answered', 'Question was not answered');
          if (q.options?.length && !q.isOther) check(q.options.some((o) => o.label === r.answer), 'Answer must match an offered option label');
          answers[q.id] = { answers: [r.answer] };
        }
        result = { answers };
      } else if (msg.method === 'item/permissions/requestApproval') {
        // Scope grants are NOT single-operation approvals. Never expand permissions here.
        result = { permissions: {} };
      } else {
        if (!ended) send({ id: msg.id, error: { code: -32601, message: 'Unsupported remote request; review locally' } });
        pending.delete(String(msg.id));
        return;
      }
    } catch {
      result = msg.method === 'item/tool/requestUserInput' ? { answers: {} } : { decision: 'decline' };
    } finally {
      for (const id of entry.ids) void client.cancel(id).catch(() => {});
    }
    if (!entry.controller.signal.aborted && !ended) send({ id: msg.id, result });
    pending.delete(String(msg.id));
  };
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    let msg; try { msg = JSON.parse(line); } catch { failure(); return; }
    if (msg.method && msg.id !== undefined) { void handleNative(msg).catch(failure); return; }
    if (msg.id !== undefined) {
      const wait = rpc.get(msg.id); if (!wait) return;
      clearTimeout(wait.timer); rpc.delete(msg.id);
      if (msg.error) wait.reject(new RelayError('Codex rejected a request; check local authentication and version', 502)); else wait.resolve(msg.result);
      return;
    }
    const p = msg.params ?? {};
    if (p.threadId && threadId && p.threadId !== threadId) return;
    if (msg.method === 'serverRequest/resolved') clearNative(p.requestId);
    if (msg.method === 'item/started' && p.item?.id) items.set(p.item.id, p.item);
    if (msg.method === 'item/completed' && p.item?.type === 'agentMessage') lastMessage = p.item.text ?? '';
    if (msg.method === 'turn/completed') resolveDone(p.turn);
  });
  const stop = () => { failure(); child.kill('SIGTERM'); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    await call('initialize', { clientInfo: { name: 'donerelay', title: 'DoneRelay', version: '0.1.0' }, capabilities: { experimentalApi: true } });
    send({ method: 'initialized', params: {} });
    const started = await call('thread/start', { cwd: path.resolve(cwd), approvalPolicy: 'untrusted', sandbox: 'workspace-write' });
    threadId = started.thread.id;
    await call('turn/start', { threadId, input: [{ type: 'text', text: prompt }] });
    const turn = await done;
    await client.create({ kind: 'notification', task: `Codex ${threadId}`, message: `Turn ${turn?.status ?? 'finished'}\n${lastMessage}`.slice(0, 2000) });
    return { threadId, status: turn?.status ?? 'unknown' };
  } finally {
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    for (const id of pending.keys()) clearNative(id);
    lines.close(); child.kill('SIGTERM');
  }
}
