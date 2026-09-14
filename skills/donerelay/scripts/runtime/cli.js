#!/usr/bin/env node
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { serve } from './server.js';
import { runCodex } from './adapters/codex.js';
import { check, safeError } from './util.js';
import { VERSION } from './version.js';
import { doctor } from './doctor.js';
import { ensureLocal, localStatus, stopLocal, uninstallLocal, localDoctor } from './local.js';
import { setup } from './setup.js';
import { prepareSlackNotification, slackReceipt } from './slack.js';
import { slackRequestCommand } from './slack-requests.js';
const HELP = `DoneRelay ${VERSION}
  donerelay slack prepare             Validate/render a self-DM notification from host MCP context (stdin JSON)
  donerelay slack open|create|sent|ingest|get|take|cancel|close  Manage host-mediated thread decisions (stdin JSON)
  donerelay slack receipt             Validate a host-reported send result (stdin JSON)
  donerelay setup [--language en|zh|auto]  Pair Telegram privately in your terminal
  donerelay start                     Start or reuse the bundled local service
  donerelay status                    Show local service status without secrets
  donerelay stop                      Stop only when no requests are pending
  donerelay uninstall [--purge]        Stop; optionally remove local settings/history
  donerelay doctor                    Check local setup and service connectivity
  donerelay request [--wait]           Read a request JSON object from stdin
  donerelay preferences               Read the saved local language preference
  donerelay get REQUEST_ID             Inspect an existing request
  donerelay cancel REQUEST_ID          Cancel a pending request (never approve it)
  donerelay codex --prompt TEXT [--cwd DIRECTORY] [--plan]

The skill includes this complete runtime. Setup generates the local connection.
No bridge URL, API token, Docker, or separate server is required.
For scripted setup only: setup --from-env imports Telegram variables after validation.
Low-level development: serve and doctor --bridge use explicit environment configuration.
Request fields: kind (notification|question|approval), task, message,
               optional ttlSeconds, channels, idempotencyKey, language (auto|en|zh).
Use --language en|zh|auto with request or codex, or set DONERELAY_LANGUAGE.
Exit codes: 0 sent/answered/approved/completed, 2 denied/expired/cancelled/failed,
            1 configuration or transport error. Never infer approval from exit 0 alone;
            inspect the JSON status and original request ID.
`;
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    help: { type: 'boolean', short: 'h' }, wait: { type: 'boolean', default: false },
    prompt: { type: 'string' }, cwd: { type: 'string' },
    bridge: { type: 'boolean', default: false }, version: { type: 'boolean' },
    plan: { type: 'boolean', default: false },
    language: { type: 'string' },
    'from-env': { type: 'boolean', default: false }, purge: { type: 'boolean', default: false },
  } });
  const [command, id] = positionals;
  if (values.version) console.log(VERSION);
  else if (values.help || !command) console.log(HELP);
  else if (command === 'slack') {
    check(['prepare', 'receipt', 'open', 'create', 'sent', 'ingest', 'get', 'take', 'cancel', 'close'].includes(id), 'Unknown Slack command; use --help.');
    const raw = fs.readFileSync(0, 'utf8'); check(Buffer.byteLength(raw) <= 262144, 'Input too large');
    const input = JSON.parse(raw);
    const result = id === 'prepare' ? prepareSlackNotification({ ...input, ...(values.language === undefined ? {} : { language: values.language }) }) : id === 'receipt' ? slackReceipt(input.prepared, input.receipt) : await slackRequestCommand(id, { ...input, ...(values.language === undefined ? {} : { language: values.language }) });
    console.log(JSON.stringify(result, null, 2));
    if (['denied', 'expired', 'cancelled', 'failed'].includes(result.status)) process.exitCode = 2;
  }
  else if (command === 'setup') console.log(JSON.stringify(await setup({ fromEnv: values['from-env'], language: values.language }), null, 2));
  else if (command === 'status') console.log(JSON.stringify(await localStatus(), null, 2));
  else if (command === 'start') { await ensureLocal(); console.log(JSON.stringify(await localStatus(), null, 2)); }
  else if (command === 'stop') console.log(JSON.stringify(await stopLocal(), null, 2));
  else if (command === 'uninstall') console.log(JSON.stringify(await uninstallLocal(process.env, { purge: values.purge }), null, 2));
  else if (command === 'doctor') { const result = values.bridge ? await doctor(process.env, { bridge: true }) : await localDoctor(); console.log(JSON.stringify(result, null, 2)); if (!result.ok) process.exitCode = 1; }
  else if (command === 'serve') await serve();
  else {
    check(['request', 'create', 'preferences', 'get', 'cancel', 'codex'].includes(command), 'Unknown command; use --help');
    let input;
    if (command === 'request' || command === 'create') {
      const raw = fs.readFileSync(0, 'utf8'); check(Buffer.byteLength(raw) <= 16384, 'Input too large');
      input = JSON.parse(raw);
      check(!input?.channels?.includes?.('slack'), 'Slack uses the host MCP connection: follow the Slack skill workflow and use slack prepare. No local service setup is needed.');
    }
    const client = await ensureLocal({ ...process.env, ...(values.language === undefined ? {} : { DONERELAY_LANGUAGE: values.language }) }); let r;
    if (command === 'request' || command === 'create') {
      if (values.language !== undefined) { check(input && typeof input === 'object' && !Array.isArray(input), 'Expected a JSON object'); input.language = values.language; }
      r = await client.create(input);
      if (values.wait && r.status === 'pending') { console.error(`Waiting for ${r.id}`); r = await client.wait(r.id); }
    } else if (command === 'preferences') r = await client.preferences();
    else if (command === 'get') r = await client.get(id);
    else if (command === 'cancel') r = await client.cancel(id);
    else if (command === 'codex') r = await runCodex({ prompt: values.prompt, cwd: values.cwd, command: process.env.CODEX_BIN ?? 'codex', plan: values.plan, client });
    else throw new Error('Unknown command; use --help');
    console.log(JSON.stringify(r, null, 2));
    if (['denied', 'cancelled', 'expired', 'failed', 'interrupted'].includes(r.status)) process.exitCode = 2;
  }
} catch (error) { console.error(safeError(error)); process.exitCode = 1; }
