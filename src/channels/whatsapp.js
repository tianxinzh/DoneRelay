import http from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { check, digest, parseReply, RelayError, secretEqual } from '../util.js';

const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_BODY = 256 * 1024;
export const WHATSAPP_WEBHOOK_PATH = '/webhooks/whatsapp';

/** Official Cloud API transport. No WhatsApp Web scraping or personal-account login. */
export class WhatsApp {
  constructor({ token, phoneNumberId, businessAccountId, userId, appSecret, verifyToken,
    graphVersion, store, fetchImpl = fetch, now = Date.now }) {
    check(typeof token === 'string' && token.length >= 16, 'Configure WHATSAPP_ACCESS_TOKEN');
    for (const [name, value] of Object.entries({ phoneNumberId, businessAccountId, userId })) {
      check(typeof value === 'string' && /^[1-9]\d{4,30}$/.test(value), `WhatsApp ${name} must be a numeric string without +`);
    }
    check(typeof appSecret === 'string' && appSecret.length >= 16, 'Configure WHATSAPP_APP_SECRET');
    check(typeof verifyToken === 'string' && verifyToken.length >= 32, 'WHATSAPP_VERIFY_TOKEN must contain at least 32 characters');
    check(verifyToken !== appSecret && verifyToken !== token, 'Use a separate WhatsApp verification token');
    check(typeof graphVersion === 'string' && /^v\d{1,3}\.0$/.test(graphVersion), 'Set WHATSAPP_GRAPH_VERSION to a supported version from your Meta app');
    Object.assign(this, { token, phoneNumberId, businessAccountId, userId, appSecret,
      verifyToken, graphVersion, store, fetchImpl, now });
    this.stateKey = `whatsapp:${digest(`${businessAccountId}/${phoneNumberId}/${userId}`)}`;
  }

  authorize(actor) {
    return actor?.private === true && actor.userId === this.userId &&
      actor.phoneNumberId === this.phoneNumberId && actor.businessAccountId === this.businessAccountId;
  }

  verifySignature(raw, signature) {
    if (!Buffer.isBuffer(raw) || typeof signature !== 'string' || !/^sha256=[0-9a-f]{64}$/i.test(signature)) return false;
    const expected = createHmac('sha256', this.appSecret).update(raw).digest();
    return timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'));
  }

  state() { return this.store.meta(this.stateKey) ?? { optedIn: false, lastInboundAt: 0, optChangedAt: 0, seen: {} }; }

  async send(message, request) {
    const state = this.state();
    if (!state.optedIn) throw Object.assign(new RelayError('Send START from the bound WhatsApp number to opt in.', 409), { code: 'whatsapp_opt_in_required' });
    if (!state.lastInboundAt || this.now() < state.lastInboundAt || this.now() - state.lastInboundAt >= WINDOW_MS) {
      throw Object.assign(new RelayError('WhatsApp reply window is closed. Send a new message from the bound number; no template fallback is configured.', 409), { code: 'whatsapp_window_closed' });
    }
    check(typeof message === 'string' && message.length > 0 && message.length <= 4096, 'WhatsApp message exceeds the text limit; no truncation allowed');
    const body = { messaging_product: 'whatsapp', recipient_type: 'individual', to: this.userId };
    // Interactive bodies have a smaller limit. Long proposals remain COMPLETE text messages.
    if (request?.kind === 'approval' && message.length <= 1024) {
      check(/^[A-F0-9]{12}$/.test(request.id), 'Invalid approval request ID');
      body.type = 'interactive';
      body.interactive = { type: 'button', body: { text: message }, action: { buttons: [
        { type: 'reply', reply: { id: `approve ${request.id}`, title: 'Approve once' } },
        { type: 'reply', reply: { id: `deny ${request.id}`, title: 'Deny' } },
      ] } };
    } else {
      body.type = 'text'; body.text = { preview_url: false, body: message };
    }
    try {
      const response = await this.fetchImpl(`https://graph.facebook.com/${this.graphVersion}/${this.phoneNumberId}/messages`, {
        method: 'POST', headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(10000),
      });
      const result = await response.json();
      if (!response.ok || result.error || result.messaging_product !== 'whatsapp' ||
          typeof result.messages?.[0]?.id !== 'string') throw new Error('Provider rejected request');
      return { providerMessageId: result.messages[0].id }; // API acceptance, not a delivery/read receipt.
    } catch { throw new RelayError('WhatsApp API request failed; check account, version, permissions, and window locally. Credentials omitted.', 502); }
  }

  /** Only call with the ORIGINAL HTTP bytes. Auth and resource binding precede all state changes. */
  handle(raw, signature) {
    check(Buffer.isBuffer(raw) && raw.length <= MAX_BODY, 'Webhook body too large', 413);
    check(this.verifySignature(raw, signature), 'Invalid webhook signature', 401);
    let payload;
    try { payload = JSON.parse(raw.toString('utf8')); } catch { throw new RelayError('Invalid webhook JSON'); }
    check(payload?.object === 'whatsapp_business_account' && Array.isArray(payload.entry), 'Invalid WhatsApp webhook');
    let processed = 0;
    for (const entry of payload.entry) {
      if (entry?.id !== this.businessAccountId || !Array.isArray(entry.changes)) continue;
      for (const change of entry.changes) {
        const value = change?.value;
        if (change?.field !== 'messages' || value?.messaging_product !== 'whatsapp' ||
            value.metadata?.phone_number_id !== this.phoneNumberId || value.group_id || !Array.isArray(value.messages)) continue;
        for (const m of value.messages) {
          const actor = { private: !m?.group_id && !m?.context?.group_id, userId: m?.from,
            phoneNumberId: value.metadata.phone_number_id, businessAccountId: entry.id };
          if (!this.authorize(actor) || typeof m.id !== 'string' || !m.id || m.id.length > 512 ||
              typeof m.timestamp !== 'string' || !/^\d{1,13}$/.test(m.timestamp)) continue;
          const stamp = Number(m.timestamp) * 1000;
          // Old webhook retries must not reopen the 24-hour window. Future timestamps fail closed.
          if (!Number.isSafeInteger(stamp) || stamp > this.now() + 60000 || this.now() - stamp >= WINDOW_MS) continue;
          let input;
          if (m.type === 'text') input = m.text?.body;
          else if (m.type === 'interactive' && m.interactive?.type === 'button_reply') input = m.interactive.button_reply?.id;
          if (typeof input !== 'string' || input.length > 4096) continue;
          const state = this.state(); const messageKey = digest(m.id);
          if (state.seen[messageKey]) continue;
          const control = m.type === 'text' ? input.trim().toUpperCase() : '';
          const seen = Object.fromEntries(Object.entries(state.seen).filter(([, t]) => this.now() - t < WINDOW_MS));
          // Bounded persistent replay cache. Fail rather than evict fresh IDs and reopen replay paths.
          check(Object.keys(seen).length < 2000, 'WhatsApp replay cache is full; retry later', 503);
          // Commit replay marker, consent/window update and decision in ONE durable transaction.
          this.store.change((data) => {
            const next = { ...state, seen: { ...seen, [messageKey]: stamp }, lastInboundAt: Math.max(state.lastInboundAt, Math.min(stamp, this.now())) };
            if (control === 'STOP' && stamp >= state.optChangedAt) { next.optedIn = false; next.optChangedAt = stamp; }
            if (control === 'START' && stamp > state.optChangedAt) { next.optedIn = true; next.optChangedAt = stamp; }
            data.meta[this.stateKey] = next;
            if (!next.optedIn || stamp < next.optChangedAt || control === 'START' || control === 'STOP') return;
            const reply = parseReply(input);
            if (!reply) return;
            const r = data.requests[reply.id];
            if (!r || r.status !== 'pending' || r.expiresAt <= this.now() ||
                stamp < Math.floor(r.createdAt / 1000) * 1000 || !r.channels.includes('whatsapp') ||
                r.deliveries.whatsapp?.status !== 'sent') return;
            if (r.kind === 'approval' ? !['approve', 'deny'].includes(reply.action) : reply.action !== 'answer') return;
            if (reply.action === 'answer' && (reply.answer.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(reply.answer))) return;
            r.status = reply.action === 'approve' ? 'approved' : reply.action === 'deny' ? 'denied' : 'answered';
            r.answer = reply.action === 'answer' ? reply.answer : null;
            r.resolvedAt = this.now(); r.resolvedBy = { channel: 'whatsapp', userId: this.userId };
          });
          processed += 1;
        }
      }
    }
    return { processed };
  }
}

/** Separate listener: the public tunnel NEVER needs access to the private /v1 API. */
export function makeWhatsAppWebhookServer(channel) {
  const server = http.createServer(async (req, res) => {
    const respond = (status, body) => {
      if (!res.destroyed) { res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(body); }
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname !== WHATSAPP_WEBHOOK_PATH) return respond(404, 'Not found');
      if (req.method === 'GET') {
        const challenge = url.searchParams.get('hub.challenge');
        check(url.searchParams.get('hub.mode') === 'subscribe' && secretEqual(url.searchParams.get('hub.verify_token'), channel.verifyToken), 'Verification rejected', 403);
        check(typeof challenge === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(challenge), 'Invalid challenge');
        return respond(200, challenge);
      }
      if (req.method !== 'POST') return respond(405, 'Method not allowed');
      check(req.headers['content-type']?.split(';')[0].trim().toLowerCase() === 'application/json', 'JSON required', 415);
      check(!req.headers['content-encoding'] || req.headers['content-encoding'] === 'identity', 'Unsupported encoding', 415);
      if (req.headers['content-length']) check(Number(req.headers['content-length']) <= MAX_BODY, 'Webhook body too large', 413);
      check(typeof req.headers['x-hub-signature-256'] === 'string', 'Signature required', 401);
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; check(size <= MAX_BODY, 'Webhook body too large', 413); chunks.push(chunk); }
      channel.handle(Buffer.concat(chunks), req.headers['x-hub-signature-256']);
      // State persisted before 200; there is no provider network call in this path.
      respond(200, 'EVENT_RECEIVED');
    } catch (e) {
      respond(e instanceof RelayError ? e.status : 500, e instanceof RelayError ? e.message : 'Webhook processing failed');
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  return server;
}
