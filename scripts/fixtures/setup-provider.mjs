// Only for a terminal smoke test. No real Telegram account or outbound network.
let challenge;
const log = console.log;
console.log = (...args) => {
  const match = args.join(' ').match(/https:\/\/t\.me\/fixture_bot\?start=(donerelay_[a-f0-9]+)/);
  if (match) challenge = match[1];
  log(...args);
};
globalThis.fetch = async (url) => {
  const method = new URL(url).pathname.split('/').at(-1);
  const result = {
    getMe: { id: 123, is_bot: true, username: 'fixture_bot' },
    getWebhookInfo: { url: '' },
    getChat: { id: 10, type: 'private' },
    getUpdates: [{ update_id: 1, message: { chat: { id: 10, type: 'private' }, from: { id: 10, is_bot: false }, text: `/start ${challenge}` } }],
  }[method];
  if (!result) throw Error('Unexpected fixture method');
  return new Response(JSON.stringify({ ok: true, result }));
};
