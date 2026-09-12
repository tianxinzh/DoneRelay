import { randomBytes } from 'node:crypto';
import { check, delay, RelayError, safeError } from '../util.js';

// Experimental compatible text transport; not an official Tencent integration.
// Protocol: Tencent/openclaw-weixin/docs/protocol.md, checked 2026-09-12.
export class Weixin {
  constructor({ token, userId, contextToken, baseUrl = 'https://ilinkai.weixin.qq.com', store, fetchImpl = fetch }) {
    check(token && userId, 'WEIXIN_BOT_TOKEN and WEIXIN_USER_ID are required');
    const url = new URL(baseUrl);
    check(url.protocol === 'https:' && (url.hostname === 'weixin.qq.com' || url.hostname.endsWith('.weixin.qq.com')) &&
      !url.username && !url.password && !url.port && url.pathname === '/' && !url.search && !url.hash, 'Invalid Weixin API origin');
    Object.assign(this, { token, userId, baseUrl: url.origin, store, fetchImpl });
    if (contextToken) store.meta('weixinContext', contextToken);
  }
  authorize(a) { return a?.private === true && String(a.userId) === this.userId; }
  async api(method, body, signal) {
    try {
      const timeout = AbortSignal.timeout(45000);
      const response = await this.fetchImpl(`${this.baseUrl}/ilink/bot/${method}`, {
        method: 'POST', redirect: 'error',
        headers: { 'Content-Type': 'application/json', AuthorizationType: 'ilink_bot_token',
          Authorization: `Bearer ${this.token}`, 'X-WECHAT-UIN': Buffer.from(String(randomBytes(4).readUInt32BE())).toString('base64'),
          'iLink-App-Id': 'bot', 'iLink-App-ClientVersion': '256' },
        body: JSON.stringify({ ...body, base_info: { channel_version: '0.1.0', bot_agent: 'DoneRelay/0.1.0' } }),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      const data = await response.json();
      if (data.ret === -14 || data.errcode === -14) throw new RelayError('Weixin session expired; re-authorize locally.', 401);
      if (!response.ok || (data.ret !== undefined && data.ret !== 0) || (data.errcode !== undefined && data.errcode !== 0)) throw new Error('API error');
      return data;
    } catch (error) {
      if (error instanceof RelayError) throw error;
      throw new RelayError('Weixin request failed; verify credentials, context, and account access.', 502);
    }
  }
  async send(message) {
    const context = this.store.meta('weixinContext');
    check(typeof context === 'string' && context.length > 0, 'Send a private message from the bound Weixin account first; no conversation context is available.', 503);
    return this.api('sendmessage', { msg: { from_user_id: '', to_user_id: this.userId,
      client_id: `donerelay-${randomBytes(12).toString('hex')}`, message_type: 2, message_state: 2,
      context_token: context, item_list: [{ type: 1, text_item: { text: message } }] } });
  }
  async handle(m) {
    const actor = { userId: m.from_user_id, private: !m.group_id && m.message_type === 1 };
    if (!this.authorize(actor)) return;
    if (typeof m.context_token === 'string' && m.context_token) this.store.meta('weixinContext', m.context_token);
    const body = (m.item_list ?? []).filter((i) => i.type === 1).map((i) => i.text_item?.text ?? '').join('\n');
    if (!body) return;
    let ack;
    try { const r = this.relay.receive('weixin', body, actor); ack = `${r.id}: ${r.status}`; }
    catch (e) { ack = safeError(e); }
    await this.send(ack);
  }
  async poll(signal) {
    let failures = 0;
    while (!signal.aborted) {
      try {
        const data = await this.api('getupdates', { get_updates_buf: this.store.meta('weixinCursor') ?? '' }, signal);
        for (const m of data.msgs ?? []) {
          if (signal.aborted) break;
          try { await this.handle(m); } catch { console.error('Weixin acknowledgement failed (details redacted).'); }
        }
        if (typeof data.get_updates_buf === 'string' && data.get_updates_buf) this.store.meta('weixinCursor', data.get_updates_buf);
        failures = 0;
        await delay(100, signal);
      } catch (error) {
        if (!signal.aborted) {
          console.error('Weixin polling unavailable; no approval will be inferred.');
          await delay(error.status === 401 ? 3600000 : Math.min(30000, 1000 * 2 ** Math.min(++failures, 5)), signal);
        }
      }
    }
  }
}
