import { invariant, jsonFetch, sleep, log } from '../common.mjs';

export class Telegram {
  name = 'telegram';
  constructor({ token, userId, chatId, store, request = jsonFetch }) {
    invariant(token && /^\d+$/.test(String(userId)) && /^\d+$/.test(String(chatId)), 'Telegram requires a bot token and positive private user/chat IDs');
    this.token = token; this.userId = String(userId); this.chatId = String(chatId); this.store = store; this.request = request;
  }
  authorized(e) { return e.private === true && String(e.userId) === this.userId && String(e.chatId) === this.chatId; }
  async call(method, body, signal, timeout = 15000) {
    const result = await this.request(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), timeout, signal,
    });
    invariant(result.ok === true, 'Telegram API rejected the request', 502);
    return result.result;
  }
  async send(body, r) {
    const payload = { chat_id: this.chatId, text: body, link_preview_options: { is_disabled: true } };
    if (r?.kind === 'approval') payload.reply_markup = { inline_keyboard: [[
      { text: 'Approve once / 批准本次', callback_data: `dr:a:${r.id}:${r.nonce}` },
      { text: 'Reject / 拒绝', callback_data: `dr:r:${r.id}:${r.nonce}` },
    ]] };
    // Retry only explicit rate-limit rejections; ambiguous send timeouts are not replayed.
    for (let attempt = 0; ; attempt++) {
      try { return (await this.call('sendMessage', payload)).message_id; }
      catch (error) {
        if (attempt >= 2 || !error.retryAfter || error.retryAfter > 30) throw error;
        await sleep(error.retryAfter * 1000);
      }
    }
  }
  clear(messageId) { return this.call('editMessageReplyMarkup', { chat_id: this.chatId, message_id: Number(messageId), reply_markup: { inline_keyboard: [] } }); }
  async handle(update, onMessage) {
    const cb = update.callback_query, msg = cb?.message || update.message;
    if (!msg) return;
    const event = { private: msg.chat?.type === 'private', userId: cb?.from?.id ?? msg.from?.id,
      chatId: msg.chat?.id, messageId: msg.message_id, replyTo: msg.reply_to_message?.message_id,
      callback: cb?.data, text: msg.text };
    if (!this.authorized(event)) return;
    if (cb) { try { await this.call('answerCallbackQuery', { callback_query_id: cb.id }); } catch {} }
    await onMessage(event);
  }
  async run(onMessage, signal) {
    // Do not delete an existing webhook or steal an existing bot consumer.
    const info = await this.call('getWebhookInfo', {}, signal);
    invariant(!info.url, 'Telegram bot already has a webhook; use a dedicated bot or remove the webhook yourself');
    let backoff = 1000;
    while (!signal.aborted) {
      try {
        const updates = await this.call('getUpdates', { offset: this.store.getState('telegram:offset', 0),
          timeout: 25, allowed_updates: ['message', 'callback_query'] }, signal, 35000);
        for (const update of updates) {
          await this.handle(update, onMessage);
          this.store.setState('telegram:offset', update.update_id + 1);
        }
        backoff = 1000;
      } catch {
        if (signal.aborted) break;
        log('channel_poll_failed', { channel: this.name });
        await sleep(backoff, signal).catch(() => {}); backoff = Math.min(backoff * 2, 30000);
      }
    }
  }
}
