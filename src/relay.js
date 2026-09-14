import { randomBytes } from 'node:crypto';
import { check, digest, parseReply, text } from './util.js';
import { languageChoice, resolveLanguage, words } from './language.js';

export function formatRequest(r) {
  const w = words(r.language ?? resolveLanguage('auto', r.message));
  const header = `DoneRelay | ${w[r.kind]}\n${w.task}: ${r.task}\n${w.request}: ${r.id}\n\n${r.message}`;
  if (r.kind === 'notification') return header;
  const footer = r.kind === 'approval'
    ? `${w.approve} ${r.id}\n${w.deny} ${r.id}`
    : `${w.answer} ${r.id} ${w.answerHint}`;
  return `${header}\n\n${w.expires}: ${new Date(r.expiresAt).toISOString()}\n${footer}`;
}
export class Relay {
  constructor(store, channels, now = Date.now, language = 'auto') { this.store = store; this.channels = channels; this.now = now; this.language = languageChoice(language); }
  preference() { return this.store.meta('language') ?? this.language; }
  async create(input) {
    check(input && typeof input === 'object' && !Array.isArray(input), 'Expected a JSON object');
    const kind = input.kind ?? 'notification';
    check(['notification', 'approval', 'question'].includes(kind), 'Invalid request kind');
    const task = text(input.task, 'task', 160);
    // Do not silently truncate approval text: the human must see the complete proposal.
    const message = text(input.message, 'message', 2000);
    const language = resolveLanguage(input.language ?? this.preference(), message);
    const ttlSeconds = input.ttlSeconds ?? 3600;
    check(Number.isInteger(ttlSeconds) && ttlSeconds >= 1 && ttlSeconds <= 86400, 'ttlSeconds must be 1..86400');
    const channels = input.channels ?? Object.keys(this.channels);
    check(Array.isArray(channels) && channels.length > 0 && channels.length <= 3 &&
      new Set(channels).size === channels.length && channels.every((c) => typeof c === 'string' && Object.hasOwn(this.channels, c)), 'Select configured channels only');
    const binding = digest(JSON.stringify({ task, message, kind, channels, ttlSeconds, language }));
    const key = input.idempotencyKey === undefined ? null : text(input.idempotencyKey, 'idempotencyKey', 160);
    if (key) {
      const previous = Object.values(this.store.data.requests).find((r) => r.idempotencyKey === key);
      if (previous) {
        // Preserve idempotency for requests created before language was stored.
        const legacy = !previous.language && previous.binding === digest(JSON.stringify({ task, message, kind, channels, ttlSeconds })) && input.language === undefined;
        check(previous.binding === binding || legacy, 'Idempotency key reused with different content', 409); return this.store.get(previous.id);
      }
    }
    this.store.sweep();
    check(Object.keys(this.store.data.requests).length < 10000, 'Request limit reached; wait for retention cleanup', 503);
    const r = this.store.put({ id: randomBytes(6).toString('hex').toUpperCase(), task, kind, message, channels,
      binding, language, idempotencyKey: key, status: kind === 'notification' ? 'sending' : 'pending',
      createdAt: this.now(), expiresAt: this.now() + ttlSeconds * 1000, deliveries: {} });
    await Promise.all(channels.map(async (name) => {
      let delivery;
      try {
        const result = await this.channels[name].send(formatRequest(r), r);
        delivery = { status: 'sent' };
        if (result?.providerMessageId) delivery.providerMessageId = result.providerMessageId;
        if (result?.providerChatId) delivery.providerChatId = result.providerChatId;
        if (result?.providerBotId) delivery.providerBotId = result.providerBotId;
      } catch (error) {
        delivery = { status: 'failed', error: 'Delivery failed; check channel credentials, context, and connectivity.' };
        if (['whatsapp_opt_in_required', 'whatsapp_window_closed'].includes(error?.code)) delivery.code = error.code;
      }
      const current = this.store.get(r.id);
      this.store.patch(r.id, { deliveries: { ...current.deliveries, [name]: delivery } });
    }));
    const current = this.store.get(r.id);
    if (kind === 'notification') {
      const sent = Object.values(current.deliveries).some((d) => d.status === 'sent');
      return this.store.patch(r.id, { status: sent ? 'sent' : 'failed', resolvedAt: this.now() });
    }
    return current;
  }
  receive(channel, input, actor) {
    check(this.channels[channel]?.authorize(actor), 'Sender is not authorized', 403);
    const reply = parseReply(input);
    check(reply, words('en').replyHelp);
    if (reply.action === 'answer') text(reply.answer, 'answer', 2000);
    return this.store.decide(reply.id, reply.action, reply.answer, { channel, userId: String(actor.userId) });
  }
  cancel(id) {
    const r = this.store.get(id);
    return r.status === 'pending' ? this.store.patch(id, { status: 'cancelled', resolvedAt: this.now(), reason: 'caller_cancelled' }) : r;
  }
}
