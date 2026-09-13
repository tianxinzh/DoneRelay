import test from 'node:test';
import assert from 'node:assert/strict';
import { agentEnvironment, runCodex } from '../src/adapters/codex.js';

test('Agent environment removes all messaging and bridge namespaces without mutating its input', () => {
  const source = { PATH: '/usr/bin', HOME: '/home/test', OPENAI_API_KEY: 'agent-owned-fixture',
    WHATSAPP_ACCESS_TOKEN: 'fixture', WHATSAPP_APP_SECRET: 'fixture', WHATSAPP_VERIFY_TOKEN: 'fixture',
    TELEGRAM_BOT_TOKEN: 'fixture', WEIXIN_BOT_TOKEN: 'fixture', DONERELAY_API_TOKEN: 'fixture',
    whatsapp_access_token: 'fixture' };
  const before = { ...source };
  assert.deepEqual(agentEnvironment(source), { PATH: source.PATH, HOME: source.HOME, OPENAI_API_KEY: source.OPENAI_API_KEY });
  assert.deepEqual(source, before);
});

test('Codex spawn receives an environment without WhatsApp credentials', async () => {
  const old = process.env.WHATSAPP_ACCESS_TOKEN;
  const stop = new Error('fixture spawn stopped before starting a process');
  let captured;
  process.env.WHATSAPP_ACCESS_TOKEN = 'fixture-not-a-real-token';
  try {
    await assert.rejects(runCodex({ prompt: 'Inspect tests', client: {}, spawnImpl: (_command, _args, options) => {
      captured = options.env;
      throw stop;
    } }), (error) => error === stop);
    assert.ok(captured);
    assert.equal(Object.hasOwn(captured, 'WHATSAPP_ACCESS_TOKEN'), false);
    assert.equal(captured.PATH, process.env.PATH);
    assert.equal(process.env.WHATSAPP_ACCESS_TOKEN, 'fixture-not-a-real-token');
  } finally {
    if (old === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN;
    else process.env.WHATSAPP_ACCESS_TOKEN = old;
  }
});
