import test from 'node:test';
import assert from 'node:assert/strict';
import { doctor } from '../src/doctor.js';
import { VERSION } from '../src/version.js';
const env = { DONERELAY_API_TOKEN: 's'.repeat(32) };
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status });
test('doctor verifies health and authentication without creating requests or printing secrets', async () => {
  const paths = [];
  const result = await doctor(env, { fetchImpl: async (url, options) => {
    paths.push(new URL(url).pathname);
    assert.equal(options.redirect, 'error');
    assert.equal(options.method, undefined);
    return url.endsWith('/healthz') ? reply({ ok: true, version: VERSION }) : reply({ error: 'Unknown request' }, 404);
  } });
  assert.equal(result.ok, true);
  assert.deepEqual(paths, ['/healthz', '/v1/requests/000000000000']);
  assert.equal(JSON.stringify(result).includes(env.DONERELAY_API_TOKEN), false);
});
test('doctor fails on missing configuration, insecure URLs, unauthorized responses, and network failures', async () => {
  for (const source of [{}, {...env, DONERELAY_URL: 'http://remote.example'}]) {
    const result = await doctor(source, { fetchImpl: () => { throw Error('must not fetch'); } });
    assert.equal(result.ok, false);
  }
  for (const fetchImpl of [async () => reply({error:'Unauthorized'},401), async () => { throw Error(env.DONERELAY_API_TOKEN); }]) {
    const result = await doctor(env, { fetchImpl });
    assert.equal(result.ok, false);
    assert.equal(JSON.stringify(result).includes(env.DONERELAY_API_TOKEN), false);
  }
});
test('doctor flags version skew and does not accept unrelated 404 responses as authentication', async () => {
  const result = await doctor(env, {fetchImpl: async url => url.endsWith('/healthz') ? reply({ok:true,version:'old'}) : reply({error:'Not found'},404)});
  assert.equal(result.checks.find(c=>c.name==='bridge_version').ok,false);
  assert.equal(result.checks.find(c=>c.name==='bridge_auth').ok,false);
});
test('bridge doctor detects missing channel settings without disclosing values', async () => {
  const result = await doctor({...env,TELEGRAM_BOT_TOKEN:'12345:fixture',PORT:'invalid'}, {bridge:true,fetchImpl:async url=>url.endsWith('/healthz')?reply({ok:true,version:VERSION}):reply({error:'Unknown request'},404)});
  assert.equal(result.ok,false);
  assert.equal(result.checks.find(c=>c.name==='telegram_configuration').ok,false);
  assert.equal(result.checks.find(c=>c.name==='PORT').ok,false);
  assert.equal(JSON.stringify(result).includes('12345:fixture'),false);
});
