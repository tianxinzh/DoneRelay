import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { invariant, jsonFetch, randomId, sleep, log } from '../common.mjs';

// Independent, experimental client of Tencent's documented plugin wire protocol.
// This is not Tencent's plugin and does not assert a general WeChat API entitlement.
export function weixinBase(value = 'https://ilinkai.weixin.qq.com') {
  const url = new URL(value);
  invariant(url.protocol === 'https:' && !url.username && !url.password && !url.port &&
    (url.hostname === 'ilinkai.weixin.qq.com' || url.hostname.endsWith('.ilinkai.weixin.qq.com')) &&
    url.pathname === '/' && !url.search && !url.hash, 'Untrusted Weixin API host');
  return url.origin;
}
const version = '2.4.8'; // Compatibility metadata, not a claim to be the official plugin.
function headers(token, post = true) {
  const h = { 'iLink-App-Id': 'bot', 'iLink-App-ClientVersion': String((2 << 16) | (4 << 8) | 8) };
  if (post) Object.assign(h, { 'Content-Type': 'application/json' }, { AuthorizationType: 'ilink_bot_token',
    'X-WECHAT-UIN': Buffer.from(String(randomBytes(4).readUInt32BE())).toString('base64') });
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
export class Weixin {
  name = 'weixin';
  constructor({ token, userId, baseUrl, store, request = jsonFetch }) {
    invariant(typeof token === 'string' && token && typeof userId === 'string' && userId, 'Weixin requires bot credentials and an explicit allowed user ID');
    this.token = token; this.userId = userId; this.baseUrl = weixinBase(baseUrl); this.store = store; this.request = request;
  }
  authorized(e) { return e.private === true && e.userId === this.userId; }
  async call(method, body, signal, timeout = 15000) {
    const result = await this.request(`${this.baseUrl}/ilink/bot/${method}`, {
      method: 'POST', headers: headers(this.token), timeout, signal,
      body: JSON.stringify({ ...body, base_info: { channel_version: version, bot_agent: 'DoneRelay/0.1.0' } }),
    });
    if ((result.ret != null && result.ret !== 0) || (result.errcode != null && result.errcode !== 0)) {
      const error = new Error('Weixin API rejected the request');
      error.sessionExpired = result.ret === -14 || result.errcode === -14; throw error;
    }
    return result;
  }
  async send(body) {
    const context = this.store.getState(`weixin:context:${this.userId}`);
    invariant(context, 'No Weixin conversation context. Send the bot a private message first.', 503);
    const id = randomId();
    await this.call('sendmessage', { msg: { from_user_id: '', to_user_id: this.userId,
      client_id: `donerelay-${id}`, message_type: 2, message_state: 2, context_token: context,
      item_list: [{ type: 1, text_item: { text: body } }] } });
    return id;
  }
  async handle(msg, onMessage) {
    if (msg.from_user_id !== this.userId || msg.group_id || msg.message_type !== 1) return;
    if (msg.context_token) this.store.setState(`weixin:context:${this.userId}`, msg.context_token);
    const body = (msg.item_list || []).filter(i => i.type === 1).map(i => i.text_item?.text || '').join('\n');
    if (!body) return; // Voice, media, groups and edited-message handling are not supported.
    await onMessage({ private: true, userId: msg.from_user_id, messageId: msg.message_id, text: body });
  }
  async run(onMessage, signal) {
    let backoff = 1000;
    while (!signal.aborted) {
      try {
        const response = await this.call('getupdates', { get_updates_buf: this.store.getState('weixin:cursor', '') }, signal, 45000);
        for (const msg of response.msgs || []) await this.handle(msg, onMessage);
        if (response.get_updates_buf) this.store.setState('weixin:cursor', response.get_updates_buf);
        backoff = 1000;
        if (!response.msgs?.length) await sleep(250, signal);
      } catch (error) {
        if (signal.aborted) break;
        log('channel_poll_failed', { channel: this.name, sessionExpired: !!error.sessionExpired });
        await sleep(error.sessionExpired ? 3600000 : backoff, signal).catch(() => {});
        backoff = Math.min(backoff * 2, 30000);
      }
    }
  }
}

export async function loginWeixin(path, { signal = AbortSignal.timeout(180000), request = jsonFetch } = {}) {
  const base = weixinBase();
  const qr = await request(`${base}/ilink/bot/get_bot_qrcode?bot_type=3`, {
    method: 'POST', headers: headers(null), body: JSON.stringify({ local_token_list: [] }), signal,
  });
  invariant(typeof qr.qrcode === 'string' && typeof qr.qrcode_img_content === 'string', 'Unexpected Weixin QR response');
  console.error('Scan this login link/QR privately with the Weixin account you will use for approvals.');
  // Local rendering only: never send login material to a third-party QR website.
  const rendered = spawnSync('qrencode', ['-t', 'ANSIUTF8', '--', qr.qrcode_img_content], { encoding: 'utf8', timeout: 5000 });
  if (rendered.status === 0) console.error(rendered.stdout);
  else console.error(`Local QR renderer not found. Install qrencode and retry, or open the provider login link:\n${qr.qrcode_img_content}`);
  while (!signal.aborted) {
    const state = await request(`${base}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qr.qrcode)}`,
      { method: 'GET', headers: headers(null, false), timeout: 40000, signal });
    if (state.status === 'confirmed') {
      invariant(state.bot_token && state.ilink_user_id, 'Login response lacks the token or user binding');
      const account = { token: state.bot_token, userId: state.ilink_user_id, baseUrl: weixinBase(state.baseurl || base) };
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      // Exclusive create: no silent account replacement or symlink following.
      writeFileSync(path, `${JSON.stringify(account)}\n`, { mode: 0o600, flag: 'wx' });
      console.error('Weixin credentials saved locally. Start the relay, then send the bot a private message to establish context.');
      return;
    }
    invariant(['wait', 'scaned'].includes(state.status), `Weixin login requires ${state.status || 'an unsupported step'}. No credentials saved; use the official plugin flow or retry.`);
    await sleep(1500, signal);
  }
  throw new Error('Weixin login timed out');
}
