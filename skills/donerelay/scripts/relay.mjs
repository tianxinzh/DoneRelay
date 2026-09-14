#!/usr/bin/env node
// Standalone skill client: remains functional when only this skill folder is copied.
import fs from 'node:fs';
const [command, id] = process.argv.slice(2);
try {
  const url = new URL(process.env.DONERELAY_URL ?? 'http://127.0.0.1:8787');
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (!(url.protocol === 'https:' || (url.protocol === 'http:' && local)) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('Use HTTPS or loopback HTTP with no embedded credentials');
  const token = process.env.DONERELAY_API_TOKEN;
  if (!token || token.length < 32) throw Error('Configure DONERELAY_API_TOKEN locally; never print it');
  let route; let body;
  if (command === 'create') {
    const raw = fs.readFileSync(0, 'utf8'); if (Buffer.byteLength(raw) > 16384) throw Error('Input exceeds 16 KiB');
    const input = JSON.parse(raw);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Expected a JSON object');
    if (input.language === undefined && process.env.DONERELAY_LANGUAGE !== undefined) input.language = process.env.DONERELAY_LANGUAGE;
    body = JSON.stringify(input); route = '/v1/requests';
  } else if (command === 'preferences') route = '/v1/preferences';
  else if (command === 'get' && /^[A-F0-9]{12}$/.test(id)) route = `/v1/requests/${id}`;
  else throw Error('Usage: relay.mjs create < request.json | relay.mjs get REQUEST_ID | relay.mjs preferences');
  const response = await fetch(`${url.origin}${route}`, { method: body ? 'POST' : 'GET', redirect: 'error',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw Error(`DoneRelay returned HTTP ${response.status}; no approval inferred`);
  const result = await response.json(); console.log(JSON.stringify(command === 'preferences' ? result.preferences : result.request, null, 2));
} catch { console.error('DoneRelay request failed. Check local configuration, request format, and service health. No approval inferred.'); process.exitCode = 1; }
