import { createServer } from 'node:http';
import { invariant, secretEqual, log } from './common.mjs';

async function readJson(req) {
  invariant(req.headers['content-type']?.split(';')[0] === 'application/json', 'Use application/json', 415);
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length; invariant(size <= 16384, 'Request body too large', 413); chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { invariant(false, 'Invalid JSON'); }
}
export function createApi(relay, token) {
  invariant(typeof token === 'string' && token.length >= 32, 'DONERELAY_API_TOKEN must contain at least 32 characters');
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, data) => { res.writeHead(status); res.end(JSON.stringify(data)); };
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/healthz' && req.method === 'GET') return send(200, { status: 'ok', version: '0.1.0' });
      invariant(!req.headers.origin, 'Browser-origin requests are not supported', 403);
      invariant(secretEqual(req.headers.authorization, `Bearer ${token}`), 'Unauthorized', 401);
      if (req.method === 'POST' && path === '/v1/requests') return send(201, await relay.create(await readJson(req)));
      if (req.method === 'POST' && path === '/v1/notifications') return send(200, { deliveries: await relay.notify(await readJson(req)) });
      const match = /^\/v1\/requests\/([a-f0-9]{16})(\/cancel)?$/.exec(path);
      if (match && req.method === 'GET' && !match[2]) return send(200, relay.store.get(match[1]));
      if (match && req.method === 'POST' && match[2]) { relay.store.get(match[1]); relay.store.cancel(match[1]); return send(200, { status: 'cancelled' }); }
      send(404, { error: 'Not found' });
    } catch (error) {
      const status = error.status || 500;
      if (status === 500) log('api_error');
      if (!res.headersSent) send(status, { error: status === 500 ? 'Internal server error' : error.message });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  return server;
}
