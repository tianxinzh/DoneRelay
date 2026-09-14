import http from 'node:http';
import { Store } from './store.js';
import { Relay } from './relay.js';
import { Telegram } from './channels/telegram.js';
import { Weixin } from './channels/weixin.js';
import { WhatsApp, makeWhatsAppWebhookServer } from './channels/whatsapp.js';
import { check, RelayError, safeError, secretEqual } from './util.js';
import { VERSION } from './version.js';

export function makeServer(relay, token, localControl) {
  check(typeof token === 'string' && token.length >= 32, 'DONERELAY_API_TOKEN must contain at least 32 characters');
  let accepting = true; let activeCreates = 0;
  const server = http.createServer(async (req, res) => {
    const send = (status, body) => { if (!res.destroyed) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body)); } };
    try {
      if (req.method === 'GET' && req.url === '/healthz') return send(200, { ok: true, version: VERSION });
      check(secretEqual(req.headers.authorization, `Bearer ${token}`), 'Unauthorized', 401);
      if (localControl && req.url === '/v1/local/status' && req.method === 'GET') {
        relay.store.sweep();
        return send(200, { version: VERSION, instanceId: localControl.instanceId, pid: process.pid,
          pending: Object.values(relay.store.data.requests).filter(r => r.status === 'pending').length, accepting });
      }
      if (localControl && req.url === '/v1/local/stop' && req.method === 'POST') {
        relay.store.sweep();
        check(activeCreates === 0 && !Object.values(relay.store.data.requests).some(r => r.status === 'pending'),
          'Requests are pending; finish or cancel them before stopping DoneRelay.', 409);
        accepting = false;
        send(200, { stopped: true });
        setImmediate(() => localControl.stop());
        return;
      }
      if (req.method === 'GET' && req.url === '/v1/preferences') return send(200, { preferences: { language: relay.preference() } });
      if (req.method === 'POST' && req.url === '/v1/requests') {
        check(accepting, 'DoneRelay is stopping; no request accepted.', 503);
        activeCreates++;
        try {
        check(req.headers['content-type']?.split(';')[0] === 'application/json', 'Content-Type must be application/json', 415);
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; check(size <= 16384, 'Request body too large', 413); chunks.push(chunk); }
        let input; try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new RelayError('Invalid JSON'); }
        return send(201, { request: await relay.create(input) });
        } finally { activeCreates--; }
      }
      const match = req.url?.match(/^\/v1\/requests\/([A-F0-9]{12})(\/cancel)?$/);
      if (match && req.method === 'GET' && !match[2]) return send(200, { request: relay.store.get(match[1]) });
      if (match && req.method === 'POST' && match[2]) return send(200, { request: relay.cancel(match[1]) });
      send(404, { error: 'Not found' });
    } catch (error) { send(error instanceof RelayError ? error.status : 500, { error: safeError(error) }); }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  return server;
}
const closeServer = (server) => new Promise((resolve) => {
  if (server?.listening) server.close(resolve); else resolve();
});
export async function serve(env = process.env, localControl) {
  const store = new Store(env.DONERELAY_STATE_FILE ?? './data/state.json');
  const controller = new AbortController();
  let server; let webhook; let timer; const polls = [];
  try {
    const channels = {};
    if (env.TELEGRAM_BOT_TOKEN) channels.telegram = new Telegram({ token: env.TELEGRAM_BOT_TOKEN,
      chatId: env.TELEGRAM_CHAT_ID, userId: env.TELEGRAM_USER_ID, store });
    if (env.WEIXIN_BOT_TOKEN) channels.weixin = new Weixin({ token: env.WEIXIN_BOT_TOKEN,
      userId: env.WEIXIN_USER_ID, contextToken: env.WEIXIN_CONTEXT_TOKEN,
      baseUrl: env.WEIXIN_BASE_URL || undefined, store });
    if (env.WHATSAPP_ACCESS_TOKEN) channels.whatsapp = new WhatsApp({ token: env.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID, businessAccountId: env.WHATSAPP_BUSINESS_ACCOUNT_ID,
      userId: env.WHATSAPP_USER_ID, appSecret: env.WHATSAPP_APP_SECRET,
      verifyToken: env.WHATSAPP_VERIFY_TOKEN, graphVersion: env.WHATSAPP_GRAPH_VERSION, store });
    check(Object.keys(channels).length, 'Configure at least one channel in your local environment');
    const relay = new Relay(store, channels, Date.now, env.DONERELAY_LANGUAGE ?? 'auto');
    server = makeServer(relay, env.DONERELAY_API_TOKEN, localControl);
    const port = Number(env.PORT ?? 8787);
    check(Number.isInteger(port) && port >= (localControl ? 0 : 1) && port < 65536, 'Invalid PORT');
    if (channels.whatsapp) {
      const webhookPort = Number(env.WHATSAPP_WEBHOOK_PORT ?? 8788);
      check(Number.isInteger(webhookPort) && webhookPort > 0 && webhookPort < 65536 && webhookPort !== port, 'WhatsApp webhook needs a valid separate port');
      webhook = makeWhatsAppWebhookServer(channels.whatsapp);
      await new Promise((resolve, reject) => { webhook.once('error', reject); webhook.listen(webhookPort, env.WHATSAPP_WEBHOOK_HOST ?? env.HOST ?? '127.0.0.1', resolve); });
    }
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, env.HOST ?? '127.0.0.1', resolve); });
    for (const channel of Object.values(channels)) {
      channel.relay = relay;
      if (typeof channel.poll === 'function') polls.push(channel.poll(controller.signal).catch(() => { console.error('Channel stopped (details redacted).'); }));
    }
    let closing = false;
    const close = async () => {
      if (closing) return; closing = true; clearInterval(timer); controller.abort();
      process.removeListener('SIGINT', close); process.removeListener('SIGTERM', close);
      await Promise.all(polls); await Promise.all([closeServer(server), closeServer(webhook)]); store.close();
    };
    timer = setInterval(() => { try { store.sweep(); } catch { console.error('State write failed; stopping.'); void close(); } }, 1000);
    console.log(`DoneRelay listening on ${env.HOST ?? '127.0.0.1'}:${port}; channels: ${Object.keys(channels).join(', ')}`);
    process.once('SIGINT', close); process.once('SIGTERM', close);
    return { server, webhook, relay, close };
  } catch (error) {
    clearInterval(timer); controller.abort();
    await Promise.all([closeServer(server), closeServer(webhook)]); store.close(); throw error;
  }
}
