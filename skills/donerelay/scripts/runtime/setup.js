import { createInterface } from 'node:readline/promises';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { Telegram } from './channels/telegram.js';
import { configureLocal, localPaths } from './local.js';
import { check, RelayError } from './util.js';

const copy = {
  en: {
    language: 'Message language [en/zh/auto] (auto): ',
    intro: 'Create a dedicated Telegram bot with @BotFather. Its token is saved privately on this computer.',
    token: 'Telegram bot token (hidden): ',
    pair: 'Open this link in your private Telegram chat and press Start:',
    wait: 'Waiting up to 3 minutes for your private Start message…',
    done: 'Setup complete. The skill can now start the bundled service automatically.',
    failed: 'Setup failed or was cancelled. Check the bot token, private chat, network, and competing bot consumers. No credentials were printed.',
  },
  zh: {
    language: '消息语言 [en/zh/auto]（默认 auto）：',
    intro: '请通过 @BotFather 创建一个专用 Telegram 机器人。令牌将保存在本机的私有配置中。',
    token: 'Telegram 机器人令牌（隐藏输入）：',
    pair: '在 Telegram 私聊中打开以下链接，然后点击开始：',
    wait: '正在等待你的私聊开始消息，最多等待三分钟……',
    done: '设置完成。技能现在可以自动启动内置服务。',
    failed: '设置失败或已取消。请检查机器人令牌、私聊、网络和其他机器人接收进程。未输出任何凭据。',
  },
};
export function hiddenInput(prompt, input = process.stdin, output = process.stdout) {
  check(input.isTTY && output.isTTY, 'Run setup in an interactive terminal. Never paste credentials into an agent conversation.');
  return new Promise((resolve, reject) => {
    let value = ''; const wasRaw = input.isRaw;
    // Disable terminal echo before publishing the prompt; fast paste/automation can otherwise race it.
    input.setRawMode(true); input.resume();
    const finish = (error) => {
      input.off('data', onData); input.off('end', onEnd); input.setRawMode(Boolean(wasRaw)); input.pause(); output.write('\n');
      if (error) reject(error); else resolve(value);
    };
    const onEnd = () => finish(new RelayError('Setup input closed.'));
    const onData = buffer => {
      for (const char of buffer.toString('utf8')) {
        if (char === '\u0003' || char === '\u0004') { finish(new RelayError('Setup cancelled.')); return; }
        if (char === '\r' || char === '\n') { finish(); return; }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ' && value.length < 512) value += char;
      }
    };
    input.on('data', onData); input.once('end', onEnd);
    output.write(prompt);
  });
}
export async function validateTelegram(config, fetchImpl = fetch) {
  const telegram = new Telegram({ token: config.TELEGRAM_BOT_TOKEN, userId: config.TELEGRAM_USER_ID, chatId: config.TELEGRAM_CHAT_ID, fetchImpl });
  const bot = await telegram.api('getMe', {});
  const chat = await telegram.api('getChat', { chat_id: telegram.chatId });
  const hook = await telegram.api('getWebhookInfo', {});
  check(bot.is_bot === true && chat.type === 'private' && String(chat.id) === telegram.userId && !hook.url,
    'Use a private chat and a dedicated Telegram bot without a webhook.');
}
export async function setup({ fromEnv = false, language } = {}, env = process.env) {
  let selected = language ?? 'auto';
  let ui = selected === 'zh' || (selected === 'auto' && /^zh/i.test(env.LANG ?? '')) ? 'zh' : 'en';
  try {
    check(!fs.existsSync(localPaths(env).connection) && !fs.existsSync(localPaths(env).config), 'Already configured; use status.');
    check(['en', 'zh', 'auto'].includes(selected), 'Invalid language.');
    if (fromEnv) {
      const config = { TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN, TELEGRAM_USER_ID: env.TELEGRAM_USER_ID,
        TELEGRAM_CHAT_ID: env.TELEGRAM_CHAT_ID, DONERELAY_LANGUAGE: language ?? env.DONERELAY_LANGUAGE ?? 'auto' };
      await validateTelegram(config);
      return configureLocal(config, env);
    }
    check(process.stdin.isTTY && process.stdout.isTTY, 'Run setup in your own interactive terminal.');
    if (language === undefined) {
      const readline = createInterface({ input: process.stdin, output: process.stdout });
      try { selected = (await readline.question(copy[ui].language)).trim() || 'auto'; }
      finally { readline.close(); }
      check(['en', 'zh', 'auto'].includes(selected), 'Invalid language.');
      ui = selected === 'zh' ? 'zh' : selected === 'en' ? 'en' : ui;
    }
    const words = copy[ui];
    console.log(words.intro);
    const token = (await hiddenInput(words.token)).trim();
    // A temporary placeholder satisfies constructor validation; only the private pairing update binds the real user.
    const telegram = new Telegram({ token, userId: '1', chatId: '1' });
    const bot = await telegram.api('getMe', {});
    const hook = await telegram.api('getWebhookInfo', {});
    check(bot.is_bot === true && /^[A-Za-z0-9_]+$/.test(bot.username) && !hook.url, 'Bot is unavailable or already has a webhook.');
    const challenge = `donerelay_${randomBytes(16).toString('hex')}`;
    console.log(`${words.pair}\nhttps://t.me/${bot.username}?start=${challenge}\n${words.wait}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180000);
    let offset; let id;
    try {
      while (!controller.signal.aborted && !id) {
        const updates = await telegram.api('getUpdates', { offset, timeout: 20, allowed_updates: ['message'] }, controller.signal);
        for (const update of updates) {
          offset = update.update_id + 1;
          const message = update.message;
          if (message?.chat?.type === 'private' && !message.from?.is_bot && message.from?.id === message.chat.id && message.text === `/start ${challenge}`) {
            id = String(message.chat.id); break;
          }
        }
      }
    } finally { clearTimeout(timeout); }
    check(id, 'Pairing expired.');
    const config = { TELEGRAM_BOT_TOKEN: token, TELEGRAM_USER_ID: id, TELEGRAM_CHAT_ID: id, DONERELAY_LANGUAGE: selected };
    await validateTelegram(config);
    await configureLocal(config, env);
    console.log(words.done);
    return { configured: true };
  } catch { throw new RelayError(copy[ui].failed); }
}
