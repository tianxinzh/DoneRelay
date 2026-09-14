// Real bundled daemon, with only Telegram's provider boundary replaced. No external network.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
const daemon = pathToFileURL(process.argv[2]);
const { Telegram } = await import(new URL('./channels/telegram.js', daemon));
let sequence = 0;
Telegram.prototype.api = async function(method) {
  if (method === 'sendMessage') return { message_id: ++sequence, chat: { id: Number(this.chatId), type: 'private' }, from: { id: Number(this.botId), is_bot: true } };
  return {};
};
Telegram.prototype.poll = async function(signal) {
  const inbox = path.join(process.env.DONERELAY_HOME, 'fixture-inbox.json');
  while (!signal.aborted) {
    if (fs.existsSync(inbox)) {
      const update = JSON.parse(fs.readFileSync(inbox)); fs.unlinkSync(inbox);
      await this.handle(update);
    }
    await delay(30, undefined, { signal }).catch(() => {});
  }
};
await import(daemon);
