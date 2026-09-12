import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { invariant, log } from '../common.mjs';

export function childEnvironment(source = process.env) {
  // The app-server does not need messaging-provider credentials or relay authority.
  return Object.fromEntries(Object.entries(source).filter(([key]) => !/^(TELEGRAM_|WEIXIN_|DONERELAY_)/.test(key)));
}
export class CodexSession {
  constructor({ client, cwd, prompt, model, ttlSeconds = 3600, bin = 'codex', args = ['app-server'], onOutput = console.log }) {
    this.client = client; this.cwd = cwd; this.prompt = prompt; this.model = model; this.ttlSeconds = ttlSeconds;
    this.bin = bin; this.args = args; this.onOutput = onOutput;
    this.calls = new Map(); this.requests = new Map(); this.items = new Map(); this.counter = 0; this.threadId = null; this.closed = false;
    this.done = new Promise((resolve, reject) => {
      this.finish = resolve;
      this.fail = error => {
        for (const call of this.calls.values()) { clearTimeout(call.timer); call.reject(error); }
        this.calls.clear(); reject(error);
      };
    });
    // Requests may fail during startup, before run() awaits completion.
    this.done.catch(() => {});
  }
  send(message) {
    invariant(!this.closed && this.child?.stdin.writable, 'Codex connection is closed', 503);
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }
  call(method, params) {
    const id = `dr-${++this.counter}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.calls.delete(id); reject(new Error(`Codex ${method} timed out`)); }, 30000);
      this.calls.set(id, { resolve, reject, timer });
      try { this.send({ id, method, params }); }
      catch (error) { clearTimeout(timer); this.calls.delete(id); reject(error); }
    });
  }
  interrupt(turnId) {
    return this.call('turn/interrupt', { threadId: this.threadId, turnId }).catch(() => {});
  }
  async handleRequest(message, controller) {
    const p = message.params || {};
    invariant(p.threadId === this.threadId && typeof p.turnId === 'string', 'Refusing a request from another thread');
    const context = { threadId: p.threadId, turnId: p.turnId };
    if (p.itemId) context.itemId = p.itemId;
    const ask = async input => {
      const request = await this.client.create({ ...input, taskId: this.threadId, context, ttlSeconds: this.ttlSeconds });
      controller.relayId = request.id;
      return this.client.wait(request, { signal: controller.signal });
    };
    if (['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(message.method)) {
      if (Array.isArray(p.availableDecisions) && !p.availableDecisions.includes('accept')) return { decision: 'decline' };
      const item = this.items.get(p.itemId);
      // Include the exact command/diff and all requested access, never a model-generated summary alone.
      const action = JSON.stringify({ method: message.method, parameters: p, item: item || null }, null, 2);
      const hasDetails = message.method.includes('commandExecution') ? (p.command || item?.command) : item?.changes?.length;
      if (!hasDetails || action.length > 2600) {
        log('codex_local_review_required', { method: message.method });
        return { decision: 'decline' };
      }
      const r = await ask({ kind: 'approval', title: 'Codex operation approval', action });
      return { decision: r.status === 'approved' && !controller.signal.aborted ? 'accept' : 'decline' };
    }
    if (message.method === 'item/tool/requestUserInput') {
      invariant(Array.isArray(p.questions) && p.questions.length >= 1 && p.questions.length <= 10, 'Unsupported question payload');
      const answers = {};
      for (const q of p.questions) {
        // Secret entry belongs in the local terminal, never a chat transcript.
        if (q.isSecret) { await this.interrupt(p.turnId); return { answers: {} }; }
        invariant(typeof q.id === 'string' && q.id.length <= 160, 'Question ID missing');
        const options = q.options || [];
        const r = await ask({ kind: 'question', title: q.header || 'Codex question',
          question: `${q.question}${options.length ? '\n' + options.map(o => `${o.label}: ${o.description || ''}`).join('\n') : ''}`,
          choices: options.map(o => o.label), allowOther: q.isOther === true || !options.length });
        if (r.status !== 'answered' || controller.signal.aborted) { await this.interrupt(p.turnId); return { answers: {} }; }
        Object.defineProperty(answers, q.id, { value: { answers: [r.response.answer] }, enumerable: true });
      }
      return { answers };
    }
    // Unsupported grants are denied; no session-wide or persistent policy grants.
    if (message.method === 'item/permissions/requestApproval') return { permissions: {}, scope: 'turn' };
    if (message.method === 'mcpServer/elicitation/request') return { action: 'decline', content: null };
    throw new Error('Unsupported Codex server request');
  }
  async incoming(message) {
    if (message.method && Object.hasOwn(message, 'id')) {
      const controller = new AbortController();
      this.requests.set(message.id, controller);
      try {
        const result = await this.handleRequest(message, controller);
        this.requests.delete(message.id);
        if (!controller.signal.aborted) this.send({ id: message.id, result });
      } catch {
        this.requests.delete(message.id);
        if (controller.signal.aborted || this.closed) return;
        log('codex_request_failed_closed', { method: message.method });
        if (message.method.endsWith('/requestApproval') && message.method !== 'item/permissions/requestApproval')
          this.send({ id: message.id, result: { decision: 'decline' } });
        else {
          if (message.params?.turnId) await this.interrupt(message.params.turnId);
          this.send({ id: message.id, error: { code: -32603, message: 'DoneRelay could not safely handle this request' } });
        }
      }
      return;
    }
    if (Object.hasOwn(message, 'id')) {
      const call = this.calls.get(message.id);
      if (call) {
        clearTimeout(call.timer); this.calls.delete(message.id);
        if (message.error) call.reject(new Error(`Codex RPC error (${message.error.code})`));
        else call.resolve(message.result);
      }
      return;
    }
    const p = message.params || {};
    if (message.method === 'serverRequest/resolved' && p.threadId === this.threadId) {
      const controller = this.requests.get(p.requestId);
      controller?.abort();
      if (controller?.relayId) await this.client.cancel(controller.relayId).catch(() => {});
      this.requests.delete(p.requestId);
    }
    if (p.threadId !== this.threadId) return;
    if (message.method === 'item/started' && p.item?.id) this.items.set(p.item.id, p.item);
    if (message.method === 'item/completed') {
      if (p.item?.type === 'agentMessage' && p.item.text) {
        this.lastOutput = p.item.text; this.onOutput(p.item.text);
      }
      this.items.delete(p.item?.id);
    }
    if (message.method === 'turn/completed') {
      for (const controller of this.requests.values()) controller.abort();
      const status = p.turn?.status || 'unknown';
      await this.client.notify(this.threadId, `Codex turn ${status}.\n${(this.lastOutput || 'No final text.').slice(0, 2900)}`).catch(() => {});
      this.finish({ threadId: this.threadId, status });
    }
  }
  async run() {
    this.child = spawn(this.bin, this.args, { cwd: this.cwd, env: childEnvironment(), shell: false, stdio: ['pipe', 'pipe', 'inherit'] });
    this.child.on('error', () => this.fail(new Error('Cannot start Codex. Install/authenticate the Codex CLI on this machine.')));
    this.child.on('exit', () => {
      if (!this.closed) this.fail(new Error('Codex process ended before completion; pending permissions are not replayed'));
    });
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on('line', line => {
      if (line.length > 2_000_000) { this.fail(new Error('Codex message exceeds size limit')); return; }
      let message;
      try { message = JSON.parse(line); } catch { this.fail(new Error('Invalid Codex protocol message')); return; }
      this.incoming(message).catch(() => this.fail(new Error('Codex protocol handling failed')));
    });
    const stop = () => this.fail(new Error('Session interrupted locally'));
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    try {
      await this.call('initialize', { clientInfo: { name: 'donerelay', title: 'DoneRelay', version: '0.1.0' }, capabilities: { experimentalApi: false } });
      this.send({ method: 'initialized', params: {} });
      const thread = await this.call('thread/start', { cwd: this.cwd, approvalPolicy: 'on-request', ...(this.model ? { model: this.model } : {}) });
      this.threadId = thread.thread.id;
      log('codex_thread_started', { threadId: this.threadId });
      await this.call('turn/start', { threadId: this.threadId, input: [{ type: 'text', text: this.prompt }] });
      return await this.done;
    } finally {
      process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
      this.closed = true;
      for (const controller of this.requests.values()) {
        controller.abort();
        if (controller.relayId) await this.client.cancel(controller.relayId).catch(() => {});
      }
      for (const call of this.calls.values()) { clearTimeout(call.timer); call.reject(new Error('Codex connection closed')); }
      this.calls.clear(); this.lines.close();
      this.child.stdin.destroy(); this.child.kill('SIGTERM');
    }
  }
}
