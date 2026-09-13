#!/usr/bin/env node
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { Client } from './client.js';
import { serve } from './server.js';
import { runCodex } from './adapters/codex.js';
import { check, safeError } from './util.js';
import { VERSION } from './version.js';
import { doctor } from './doctor.js';
const HELP = `DoneRelay ${VERSION}
  donerelay doctor [--bridge]         Check setup without printing secrets or sending messages
  donerelay serve                     Start the configured channels and local API
  donerelay request [--wait]           Read a request JSON object from stdin
  donerelay get REQUEST_ID             Inspect an existing request
  donerelay cancel REQUEST_ID          Cancel a pending request (never approve it)
  donerelay codex --prompt TEXT [--cwd DIRECTORY] [--plan]

Use node --env-file=/secure/path/.env src/cli.js COMMAND for local configuration.
Request fields: kind (notification|question|approval), task, message,
               optional ttlSeconds, channels, idempotencyKey.
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
  } });
  const [command, id] = positionals;
  if (values.version) console.log(VERSION);
  else if (values.help || !command) console.log(HELP);
  else if (command === 'doctor') { const result = await doctor(process.env, { bridge: values.bridge }); console.log(JSON.stringify(result, null, 2)); if (!result.ok) process.exitCode = 1; }
  else if (command === 'serve') await serve();
  else {
    const client = new Client(); let r;
    if (command === 'request') {
      const raw = fs.readFileSync(0, 'utf8'); check(Buffer.byteLength(raw) <= 16384, 'Input too large');
      r = await client.create(JSON.parse(raw));
      if (values.wait && r.status === 'pending') { console.error(`Waiting for ${r.id}`); r = await client.wait(r.id); }
    } else if (command === 'get') r = await client.get(id);
    else if (command === 'cancel') r = await client.cancel(id);
    else if (command === 'codex') r = await runCodex({ prompt: values.prompt, cwd: values.cwd, command: process.env.CODEX_BIN ?? 'codex', plan: values.plan, client });
    else throw new Error('Unknown command; use --help');
    console.log(JSON.stringify(r, null, 2));
    if (['denied', 'cancelled', 'expired', 'failed', 'interrupted'].includes(r.status)) process.exitCode = 2;
  }
} catch (error) { console.error(safeError(error)); process.exitCode = 1; }
