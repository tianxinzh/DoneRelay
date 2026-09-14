import { check, delay, parseReply, RelayError } from '../util.js';
import { resolveLanguage, words, replyLanguage, replyError } from '../language.js';
export class Telegram {
  constructor({ token, chatId, userId, store, fetchImpl = fetch }) {
    check(token && /^\d+:[\w-]+$/.test(token), 'Invalid TELEGRAM_BOT_TOKEN');
    check(/^\d+$/.test(chatId) && /^\d+$/.test(userId), 'Telegram private chat/user IDs must be positive numeric strings');
    Object.assign(this, { token, chatId, userId, store, fetchImpl });
    this.botId = token.split(':')[0];
  }
  authorize(a) { return a?.private === true && String(a.userId) === this.userId && String(a.chatId) === this.chatId; }
  async api(method, body, signal) {
    try {
      const timeout = AbortSignal.timeout(40000);
      const response = await this.fetchImpl(`https://api.telegram.org/bot${this.token}/${method}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        redirect: 'error', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error('API error');
      return data.result;
    } catch { throw new RelayError('Telegram request failed; verify bot configuration or retry later.', 502); }
  }
  async send(message, request) {
    const w = words(request?.language ?? resolveLanguage('auto', message));
    const body = { chat_id: this.chatId, text: message, link_preview_options: { is_disabled: true } };
    if (request?.kind === 'question') {
      body.text += `\n\n${w.directQuestion}`;
      body.reply_markup = { force_reply: true, input_field_placeholder: w.replyPlaceholder };
    }
    if (request?.kind === 'approval') body.text += `\n\n${w.directApproval}`;
    if (request?.kind === 'approval') body.reply_markup = { inline_keyboard: [[
      { text: w.approveButton, callback_data: `approve ${request.id}` },
      { text: w.denyButton, callback_data: `deny ${request.id}` },
    ]] };
    const sent = await this.api('sendMessage', body);
    if (!request) return sent;
    check(Number.isSafeInteger(sent?.message_id) && sent.message_id > 0 && sent.chat?.type === 'private' &&
      String(sent.chat.id) === this.chatId && sent.from?.is_bot === true && String(sent.from.id) === this.botId,
      'Telegram returned an invalid message receipt', 502);
    return { providerMessageId: String(sent.message_id), providerChatId: this.chatId, providerBotId: this.botId };
  }
  repliedRequest(message) {
    const original = message.reply_to_message;
    check(!message.external_reply && !message.forward_origin && original && !original.forward_origin &&
      Number.isSafeInteger(original.message_id) && original.message_id > 0 &&
      original.chat?.type === 'private' && String(original.chat.id) === this.chatId &&
      original.from?.is_bot === true && String(original.from.id) === this.botId,
      'Reply to the original DoneRelay request message, or send a numbered command without replying.');
    const matches = Object.values(this.store.data.requests).filter(r => {
      const d = r.deliveries.telegram;
      return d?.status === 'sent' && d.providerMessageId === String(original.message_id) &&
        d.providerChatId === this.chatId && d.providerBotId === this.botId;
    });
    check(matches.length === 1, 'Reply to the original DoneRelay request message, or send a numbered command without replying.');
    return matches[0];
  }
  directInput(request, input) {
    check(typeof input === 'string' && input.trim(), 'Reply with text to the original request.');
    const command = parseReply(input);
    if (command) {
      check(command.id === request.id, 'Reply request ID does not match the original message.');
      return input;
    }
    if (request.kind === 'question') return `answer ${request.id} ${input.trim()}`;
    check(request.kind === 'approval', 'This message does not accept answers or decisions.');
    check(/^(approve|deny|批准|拒绝)$/i.test(input.trim()), 'Reply with approve or deny, or use the buttons.');
    return `${input.trim()} ${request.id}`;
  }
  async handle(update) {
    const q = update.callback_query;
    const m = q?.message ?? update.message;
    const sender = q?.from ?? m?.from;
    const actor = { userId: sender?.id, chatId: m?.chat?.id, private: m?.chat?.type === 'private' };
    if (!this.authorize(actor)) return;
    let input = q?.data ?? m?.text;
    const hasReply = !q && Boolean(m?.reply_to_message || m?.external_reply);
    const command = !q && !hasReply && typeof input === 'string' && input.trim().match(/^\/language(?:\s+(\S+))?$/i);
    if (command) {
      const selected = command[1]?.toLowerCase();
      const language = resolveLanguage(['en', 'zh'].includes(selected) ? selected : this.relay.preference(), sender?.language_code?.startsWith('zh') ? '中文' : 'English');
      const w = words(language);
      if (!['auto', 'en', 'zh'].includes(selected)) return this.send(w.languageHelp);
      this.store.meta('language', selected);
      return this.send(`${w.selected}${selected === 'auto' ? ` ${w.auto}` : ''}`);
    }
    let language = replyLanguage(this.relay, input);
    let ack;
    try {
      if (hasReply) {
        const request = this.repliedRequest(m);
        language = request.language ?? resolveLanguage('auto', request.message);
        input = this.directInput(request, input);
      }
      const r = this.relay.receive('telegram', input, actor); ack = `${r.id}: ${words(r.language ?? language)[r.status]}`;
    }
    catch (e) { ack = replyError(e, language); }
    // The state transition happens BEFORE the acknowledgement. Delivery retries cannot approve twice.
    if (q) {
      await this.api('answerCallbackQuery', { callback_query_id: q.id, text: ack.slice(0, 190) });
      await this.api('editMessageReplyMarkup', { chat_id: this.chatId, message_id: m.message_id, reply_markup: { inline_keyboard: [] } });
    } else { await this.send(ack); }
  }
  async poll(signal) {
    let failures = 0;
    while (!signal.aborted) {
      try {
        const updates = await this.api('getUpdates', { offset: this.store.meta('telegramOffset') ?? 0,
          timeout: 25, allowed_updates: ['message', 'callback_query'] }, signal);
        for (const u of updates) {
          if (signal.aborted) break;
          try { await this.handle(u); } catch { console.error('Telegram acknowledgement failed (details redacted).'); }
          this.store.meta('telegramOffset', u.update_id + 1);
        }
        failures = 0;
      } catch {
        if (!signal.aborted) { console.error('Telegram polling unavailable; retrying.'); await delay(Math.min(30000, 1000 * 2 ** Math.min(++failures, 5)), signal); }
      }
    }
  }
}
