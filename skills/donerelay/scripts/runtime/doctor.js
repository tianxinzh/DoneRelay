import { Client } from './client.js';
import { Telegram } from './channels/telegram.js';
import { Weixin } from './channels/weixin.js';
import { WhatsApp } from './channels/whatsapp.js';
import { VERSION } from './version.js';
import { languageChoice } from './language.js';

// Reports names and fixed guidance only; provider responses and credentials never enter output.
export async function doctor(env = process.env, { bridge = false, fetchImpl = fetch } = {}) {
  const checks = [];
  const add = (name, ok, guidance) => checks.push({ name, ok: Boolean(ok), guidance });
  add('node', Number(process.versions.node.split('.')[0]) >= 22, 'Use Node.js 22 or newer.');
  try { languageChoice(env.DONERELAY_LANGUAGE); add('language', true, 'Language is auto, en, or zh.'); }
  catch { add('language', false, 'Set DONERELAY_LANGUAGE to auto, en, or zh.'); }
  let client;
  try { client = new Client(env, fetchImpl); add('agent_configuration', true, 'Bridge URL and API token have valid local formats.'); }
  catch { add('agent_configuration', false, 'Set DONERELAY_API_TOKEN (at least 32 characters) and DONERELAY_URL (HTTPS or loopback HTTP, without a path or embedded credentials).'); }
  if (client) {
    try {
      const response = await fetchImpl(`${client.origin}/healthz`, { redirect: 'error', signal: AbortSignal.timeout(5000) });
      const data = await response.json();
      add('bridge_health', response.ok && data.ok === true && typeof data.version === 'string', 'Start the bridge and check host connectivity.');
      add('bridge_version', data.version === VERSION, 'Use the same release for the bridge and client.');
    } catch { add('bridge_health', false, 'Bridge unreachable or invalid response; check DONERELAY_URL, service, and network.'); }
    try {
      // A read-only lookup of a well-formed ID verifies auth without creating or deciding anything.
      const response = await fetchImpl(`${client.origin}/v1/requests/000000000000`, { redirect: 'error',
        headers: { Authorization: `Bearer ${client.token}` }, signal: AbortSignal.timeout(5000) });
      const data = await response.json();
      add('bridge_auth', (response.status === 404 && data.error === 'Unknown request') || (response.ok && data.request?.id === '000000000000'), 'Use the API token configured on this bridge.');
    } catch { add('bridge_auth', false, 'Cannot verify bridge authentication; check connectivity and the API token.'); }
  }
  if (bridge) {
    const configured = ['TELEGRAM_BOT_TOKEN', 'WEIXIN_BOT_TOKEN', 'WHATSAPP_ACCESS_TOKEN'].some(k => env[k]);
    add('channels', configured, 'Configure at least one channel on the bridge host; keep messaging credentials outside the agent workspace.');
    for (const key of ['PORT', 'WHATSAPP_WEBHOOK_PORT']) {
      if (env[key] !== undefined) add(key, /^\d+$/.test(env[key]) && Number(env[key]) > 0 && Number(env[key]) < 65536, 'Use a port from 1 to 65535.');
    }
    if (env.WHATSAPP_ACCESS_TOKEN) add('separate_webhook_port', Number(env.PORT ?? 8787) !== Number(env.WHATSAPP_WEBHOOK_PORT ?? 8788), 'WhatsApp webhook and private API must use different ports.');
    if (env.TELEGRAM_BOT_TOKEN) {
      let channel;
      try { channel = new Telegram({ token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID, userId: env.TELEGRAM_USER_ID, fetchImpl });
        add('telegram_configuration', env.TELEGRAM_CHAT_ID === env.TELEGRAM_USER_ID, 'Use the same bound user ID and private chat ID.'); }
      catch { add('telegram_configuration', false, 'Configure TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, and TELEGRAM_USER_ID as documented.'); }
      if (channel) {
        try {
          const bot = await channel.api('getMe', {});
          const chat = await channel.api('getChat', { chat_id: channel.chatId });
          const hook = await channel.api('getWebhookInfo', {});
          add('telegram_account', bot.is_bot === true && chat.type === 'private' && String(chat.id) === channel.chatId, 'Start the bot in the intended private chat and verify its configured IDs.');
          add('telegram_polling', !hook.url, 'A webhook must be removed deliberately before polling. Stop competing pollers; this check cannot detect every competing process.');
        } catch { add('telegram_account', false, 'Telegram account check failed; verify credentials, bot access, and network privately.'); }
      }
    }
    for (const [name, enabled, factory] of [
      ['weixin', env.WEIXIN_BOT_TOKEN, () => new Weixin({token:env.WEIXIN_BOT_TOKEN,userId:env.WEIXIN_USER_ID,baseUrl:env.WEIXIN_BASE_URL || undefined})],
      ['whatsapp', env.WHATSAPP_ACCESS_TOKEN, () => new WhatsApp({token:env.WHATSAPP_ACCESS_TOKEN,phoneNumberId:env.WHATSAPP_PHONE_NUMBER_ID,businessAccountId:env.WHATSAPP_BUSINESS_ACCOUNT_ID,userId:env.WHATSAPP_USER_ID,appSecret:env.WHATSAPP_APP_SECRET,verifyToken:env.WHATSAPP_VERIFY_TOKEN,graphVersion:env.WHATSAPP_GRAPH_VERSION})],
    ]) if (enabled) {
      try { factory(); add(`${name}_configuration`, true, 'Local format checks only; live channel acceptance is still required.'); }
      catch { add(`${name}_configuration`, false, 'Complete the channel variables in the setup guide. Values are never printed.'); }
    }
  }
  return { version: VERSION, ok: checks.every(c => c.ok), checks, next: bridge
    ? 'After all checks pass, send a harmless question and verify your numbered phone reply in the waiting caller.'
    : 'Run doctor --bridge on the bridge host for channel configuration checks.' };
}
