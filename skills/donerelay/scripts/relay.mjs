#!/usr/bin/env node
// Self-contained so copying only this skill directory remains useful.
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

export class RelayClient {
  constructor({ url = process.env.DONERELAY_URL || 'http://127.0.0.1:8787', token = process.env.DONERELAY_API_TOKEN } = {}) {
    const endpoint = new URL(url);
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') throw new Error('Use a bare DoneRelay origin');
    if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)))
      throw new Error('Remote relay connections require HTTPS');
    if (!token || token.length < 32) throw new Error('Set DONERELAY_API_TOKEN (at least 32 characters)');
    this.url = endpoint.origin; this.token = token;
  }
  async call(path, body, signal) {
    let response;
    try {
      response = await fetch(`${this.url}${path}`, { method: body === undefined ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error',
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000) });
    } catch { throw new Error('Cannot reach DoneRelay; no permission was granted'); }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Relay HTTP ${response.status}`);
    return data;
  }
  create(input, signal) { return this.call('/v1/requests', input, signal); }
  get(id, signal) { return this.call(`/v1/requests/${encodeURIComponent(id)}`, undefined, signal); }
  cancel(id) { return this.call(`/v1/requests/${encodeURIComponent(id)}/cancel`, {}); }
  notify(taskId, text) { return this.call('/v1/notifications', { taskId, text }); }
  async wait(request, { signal, interval = 1000 } = {}) {
    try {
      if (request.deliveries && !request.deliveries.some(d => d.status === 'sent')) throw new Error('No channel confirmed delivery; request cancelled');
      while (true) {
        signal?.throwIfAborted();
        const current = await this.get(request.id, signal);
        if (current.digest !== request.digest) throw new Error('Request identity changed');
        if (current.status !== 'pending') return current;
        await sleep(interval, undefined, { signal });
      }
    } catch (error) { await this.cancel(request.id).catch(() => {}); throw error; }
  }
}
export async function runSkillCli(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    task: { type: 'string', default: 'agent-task' }, title: { type: 'string', default: 'Agent needs your input' },
    text: { type: 'string' }, ttl: { type: 'string', default: '3600' },
  } });
  const client = new RelayClient(), command = positionals[0];
  if (command === 'notify') {
    const result = await client.notify(values.task, values.text);
    console.log(JSON.stringify(result));
    return result.deliveries.some(d => d.status === 'sent') ? 0 : 2;
  }
  if (!['ask', 'request-approval'].includes(command)) throw new Error('Use notify, ask, or request-approval with --task --title --text [--ttl seconds]');
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  let request;
  try {
    const kind = command === 'ask' ? 'question' : 'approval';
    request = await client.create({ kind, taskId: values.task, title: values.title, ttlSeconds: Number(values.ttl),
      ...(kind === 'approval' ? { action: values.text } : { question: values.text }) });
    console.error(`DoneRelay request ${request.id}; waiting for the bound human account.`);
    const result = await client.wait(request, { signal: controller.signal });
    console.log(JSON.stringify(result));
    return ['approved', 'answered'].includes(result.status) ? 0 : 2;
  } finally {
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSkillCli().then(code => { process.exitCode = code; }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
