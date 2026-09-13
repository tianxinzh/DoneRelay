import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { createHmac } from 'node:crypto';
import { serve } from '../src/server.js';

async function freePort() {
  const s = net.createServer(); await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const port = s.address().port; await new Promise((r) => s.close(r)); return port;
}
test('serve wires WhatsApp-only startup, private API and signed callback into one workflow', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'donerelay-wa-server-'));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => String(url).startsWith('https://graph.facebook.com/')
    ? new Response(JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.integration' }] }), { status: 200 })
    : originalFetch(url, options);
  const port = await freePort(); let webhookPort = await freePort();
  while (port === webhookPort) webhookPort = await freePort();
  const env = { DONERELAY_STATE_FILE: path.join(dir, 'state.json'), DONERELAY_API_TOKEN: 'x'.repeat(32),
    HOST: '127.0.0.1', PORT: String(port), WHATSAPP_WEBHOOK_PORT: String(webhookPort),
    WHATSAPP_ACCESS_TOKEN: 'test-token-not-real', WHATSAPP_PHONE_NUMBER_ID: '10000000001',
    WHATSAPP_BUSINESS_ACCOUNT_ID: '20000000001', WHATSAPP_USER_ID: '15555550123',
    WHATSAPP_APP_SECRET: 'test-app-secret-not-real', WHATSAPP_VERIFY_TOKEN: 'v'.repeat(32), WHATSAPP_GRAPH_VERSION: 'v23.0' };
  let instance;
  try {
    instance = await serve(env);
    const api = `http://127.0.0.1:${port}`; const hook = `http://127.0.0.1:${webhookPort}`;
    assert.equal((await originalFetch(`${api}/v1/requests/ABCDEF123456`)).status, 401);
    assert.equal((await originalFetch(`${hook}/v1/requests/ABCDEF123456`)).status, 404);
    const send = async (text, id) => {
      const raw = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: env.WHATSAPP_BUSINESS_ACCOUNT_ID, changes: [{ field: 'messages', value: {
        messaging_product: 'whatsapp', metadata: { phone_number_id: env.WHATSAPP_PHONE_NUMBER_ID }, messages: [{ id, from: env.WHATSAPP_USER_ID, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }] } }] }] });
      return originalFetch(`${hook}/webhooks/whatsapp`, { method: 'POST', body: raw,
        headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': 'sha256=' + createHmac('sha256', env.WHATSAPP_APP_SECRET).update(raw).digest('hex') } });
    };
    assert.equal((await send('START', 'wamid.start')).status, 200);
    const headers = { Authorization: `Bearer ${env.DONERELAY_API_TOKEN}`, 'Content-Type': 'application/json' };
    const created = await originalFetch(`${api}/v1/requests`, { method: 'POST', headers,
      body: JSON.stringify({ kind: 'approval', task: 'staging', message: 'Deploy 8f2c91a to staging only.', channels: ['whatsapp'] }) });
    assert.equal(created.status, 201); const { request } = await created.json();
    assert.equal(request.deliveries.whatsapp.status, 'sent');
    assert.equal((await send(`approve ${request.id}`, 'wamid.approve')).status, 200);
    const result = await (await originalFetch(`${api}/v1/requests/${request.id}`, { headers })).json();
    assert.equal(result.request.status, 'approved');
    assert.equal(result.request.resolvedBy.channel, 'whatsapp');
  } finally {
    if (instance) await instance.close(); globalThis.fetch = originalFetch;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
