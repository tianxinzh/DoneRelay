#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, readFileSync } from 'node:fs';
import { Store } from './store.mjs';
import { Relay } from './relay.mjs';
import { createApi } from './server.mjs';
import { Telegram } from './channels/telegram.mjs';
import { Weixin, loginWeixin } from './channels/weixin.mjs';
import { CodexSession } from './adapters/codex.mjs';
import { RelayClient, runSkillCli } from '../skills/donerelay/scripts/relay.mjs';
import { invariant, log, jsonFetch } from './common.mjs';

async function main() {
  const command = process.argv[2];
  const dataDir = resolve(process.env.DONERELAY_DATA_DIR || join(homedir(), '.donerelay'));
  if (['notify', 'ask', 'request-approval'].includes(command)) return runSkillCli(process.argv.slice(2));
  if (command === 'telegram-peers') {
    invariant(process.env.TELEGRAM_BOT_TOKEN, 'Set TELEGRAM_BOT_TOKEN first. Stop other bot consumers before inspecting updates.');
    const data = await jsonFetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getUpdates`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeout: 0, allowed_updates: ['message'] }),
    });
    invariant(data.ok && Array.isArray(data.result), 'Telegram rejected the request');
    const peers = data.result.filter(u => u.message?.chat?.type === 'private').map(u => ({ userId: u.message.from.id, chatId: u.message.chat.id }));
    console.log(JSON.stringify(peers, null, 2));
    console.error('Verify YOUR IDs, then set TELEGRAM_USER_ID and TELEGRAM_CHAT_ID. No account was paired automatically.');
    return 0;
  }
  if (command === 'weixin-login') { await loginWeixin(join(dataDir, 'weixin-account.json')); return 0; }
  if (command === 'codex') {
    const { values } = parseArgs({ args: process.argv.slice(3), options: {
      cwd: { type: 'string', default: process.cwd() }, 'prompt-file': { type: 'string' },
      prompt: { type: 'string' }, model: { type: 'string' }, ttl: { type: 'string', default: '3600' },
    } });
    invariant(values.prompt || values['prompt-file'], 'Use codex --cwd <repo> --prompt-file <file> (or --prompt <text>)');
    const prompt = values.prompt || readFileSync(values['prompt-file'], 'utf8');
    const ttlSeconds = Number(values.ttl);
    invariant(Number.isInteger(ttlSeconds) && ttlSeconds >= 1 && ttlSeconds <= 86400, '--ttl must be 1..86400 seconds');
    const result = await new CodexSession({ client: new RelayClient(), cwd: resolve(values.cwd), prompt, model: values.model, ttlSeconds }).run();
    console.log(JSON.stringify(result)); return result.status === 'completed' ? 0 : 2;
  }
  if (command !== 'serve') {
    console.log('DoneRelay 0.1.0\nCommands: serve | telegram-peers | weixin-login | codex | notify | ask | request-approval\nSee README.md for setup. No messages are sent by this help command.');
    return 0;
  }
  invariant(process.env.DONERELAY_API_TOKEN?.length >= 32, 'Set DONERELAY_API_TOKEN (at least 32 characters)');
  const store = new Store(join(dataDir, 'relay.sqlite'));
  const controller = new AbortController();
  let server, timer;
  const tasks = [];
  try {
    const channels = [];
    if (process.env.TELEGRAM_BOT_TOKEN) channels.push(new Telegram({ token: process.env.TELEGRAM_BOT_TOKEN,
      userId: process.env.TELEGRAM_USER_ID, chatId: process.env.TELEGRAM_CHAT_ID, store }));
    const accountFile = join(dataDir, 'weixin-account.json');
    if (existsSync(accountFile)) channels.push(new Weixin({ ...JSON.parse(readFileSync(accountFile, 'utf8')), store }));
    const relay = new Relay(store, channels);
    server = createApi(relay, process.env.DONERELAY_API_TOKEN);
    const host = process.env.DONERELAY_HOST || '127.0.0.1', port = Number(process.env.DONERELAY_PORT || 8787);
    invariant(Number.isInteger(port) && port > 0 && port <= 65535, 'Invalid port');
    await new Promise((ok, fail) => { server.once('error', fail); server.listen(port, host, ok); });
    log('relay_started', { host, port, channels: channels.map(c => c.name) });
    timer = setInterval(() => { store.expire(); store.prune(); }, 30000);
    for (const channel of channels) tasks.push(channel.run(e => relay.receive(channel.name, e), controller.signal)
      .catch(() => { log('channel_stopped', { channel: channel.name }); controller.abort(); }));
    await new Promise(ok => {
      const stop = () => controller.abort();
      process.once('SIGINT', stop); process.once('SIGTERM', stop);
      const done = () => { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); ok(); };
      if (controller.signal.aborted) done(); else controller.signal.addEventListener('abort', done, { once: true });
    });
  } finally {
    controller.abort(); clearInterval(timer);
    if (server) {
      await new Promise(ok => { server.close(ok); server.closeAllConnections(); });
    }
    await Promise.allSettled(tasks); store.close();
  }
  return 0;
}
main().then(code => { process.exitCode = code; }).catch(error => { console.error(error.message); process.exitCode = 1; });
