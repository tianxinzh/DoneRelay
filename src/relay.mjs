import { invariant, formatRequest, secretEqual, text, log } from './common.mjs';

export class Relay {
  constructor(store, channels) {
    invariant(channels.length, 'Configure at least one channel');
    this.store = store;
    this.channels = new Map(channels.map(c => [c.name, c]));
  }
  async create(input) {
    const r = this.store.create(input);
    const deliveries = await Promise.all([...this.channels.values()].map(async channel => {
      try {
        const id = await channel.send(formatRequest(r), r);
        this.store.delivered(r.id, channel.name, id);
        return { channel: channel.name, status: 'sent' };
      } catch {
        this.store.audit(r.id, `${channel.name}:delivery-failed`);
        log('delivery_failed', { channel: channel.name, requestId: r.id });
        return { channel: channel.name, status: 'failed' };
      }
    }));
    return { ...this.store.get(r.id), deliveries };
  }
  async notify({ taskId, text: message }) {
    const body = `DoneRelay · ${text(taskId, 'taskId', 120)}\n${text(message, 'text', 3200)}`;
    return Promise.all([...this.channels.values()].map(async channel => {
      try { await channel.send(body); return { channel: channel.name, status: 'sent' }; }
      catch { log('notification_failed', { channel: channel.name }); return { channel: channel.name, status: 'failed' }; }
    }));
  }
  // Only channel adapters call this. There is deliberately no HTTP approve endpoint.
  async receive(name, event) {
    const channel = this.channels.get(name);
    if (!channel || !channel.authorized(event)) return false;
    try {
      if (event.text?.trim() === '/pending') {
        for (const r of this.store.pending().slice(0, 20)) {
          const id = await channel.send(formatRequest(r), r);
          this.store.delivered(r.id, name, id);
        }
        return true;
      }
      let id, decision;
      if (event.callback) {
        const match = /^dr:([ar]):([0-9a-f]{16}):([0-9a-f]{16})$/.exec(event.callback);
        invariant(match, 'Invalid approval button');
        id = match[2];
        const r = this.store.get(id);
        invariant(secretEqual(match[3], r.nonce), 'Invalid approval button');
        invariant(this.store.forMessage(name, event.messageId) === id, 'Button does not belong to this request');
        decision = { type: match[1] === 'a' ? 'approve' : 'reject' };
      } else {
        const match = /^(approve|reject|reply|批准|拒绝|回复)\s+([0-9a-f]{16})(?:\s+([\s\S]+))?$/i.exec(event.text?.trim() || '');
        if (match) {
          id = match[2].toLowerCase();
          const verb = match[1].toLowerCase();
          const type = ({ '批准': 'approve', '拒绝': 'reject', '回复': 'reply' })[verb] || verb;
          invariant(type === 'reply' || !match[3], 'Approval must contain only the verb and request ID');
          decision = { type, text: match[3] };
        } else if (event.replyTo != null) {
          id = this.store.forMessage(name, event.replyTo);
          invariant(id && this.store.get(id).kind === 'question', 'Use explicit approve/reject and the request ID');
          decision = { type: 'reply', text: event.text };
        } else {
          // Never guess which concurrent task an unbound "yes" refers to.
          await channel.send('DoneRelay: reply to a question message, or use reply/approve/reject + request ID. 输入 /pending 查看待处理请求。');
          return true;
        }
      }
      const r = this.store.resolve(id, decision, `${name}:${event.userId}`);
      // Commit the decision before best-effort UI cleanup. Both channels share the same row.
      await Promise.allSettled(this.store.messages(id).map(m => this.channels.get(m.channel)?.clear?.(m.message_id)));
      await channel.send(`DoneRelay · ${id}: ${r.status}. Recorded for the waiting agent; this is not confirmation that the operation has executed.`);
      return true;
    } catch (error) {
      const message = error.status && error.status < 500 ? error.message : 'Could not process the reply; no additional operation was approved.';
      try { await channel.send(`DoneRelay: ${message}`); } catch {}
      return false;
    }
  }
}
