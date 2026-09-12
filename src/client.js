import { check, delay, RelayError } from './util.js';
export class Client {
  constructor(env = process.env, fetchImpl = fetch) {
    const url = new URL(env.DONERELAY_URL ?? 'http://127.0.0.1:8787');
    check((url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) &&
      !url.username && !url.password && !url.search && !url.hash && url.pathname === '/', 'Use HTTPS or loopback HTTP for DONERELAY_URL');
    this.origin = url.origin; this.token = env.DONERELAY_API_TOKEN; this.fetchImpl = fetchImpl;
    check(typeof this.token === 'string' && this.token.length >= 32, 'Configure DONERELAY_API_TOKEN locally');
  }
  async call(path, body, signal) {
    let response;
    try {
      response = await this.fetchImpl(`${this.origin}${path}`, { method: body === undefined ? 'GET' : 'POST', redirect: 'error',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000) });
    } catch { throw new RelayError('Cannot reach DoneRelay; check the local service and network', 502); }
    const result = await response.json();
    if (!response.ok) throw new RelayError(result.error ?? 'DoneRelay API error', response.status);
    return result.request;
  }
  create(input, signal) { return this.call('/v1/requests', input, signal); }
  get(id, signal) { check(/^[A-F0-9]{12}$/.test(id), 'Invalid request ID'); return this.call(`/v1/requests/${id}`, undefined, signal); }
  cancel(id) { check(/^[A-F0-9]{12}$/.test(id), 'Invalid request ID'); return this.call(`/v1/requests/${id}/cancel`, {}); }
  async wait(id, signal) {
    while (!signal?.aborted) { const r = await this.get(id, signal); if (r.status !== 'pending') return r; await delay(1000, signal); }
    throw new RelayError('Waiting cancelled; no approval granted', 409);
  }
}
