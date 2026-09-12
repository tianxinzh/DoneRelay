// Local demonstration with a simulated phone. No accounts, network, LLM or shell action.
import { Store } from '../src/store.mjs';
import { Relay } from '../src/relay.mjs';
const store = new Store();
const channel = { name: 'demo', authorized: e => e.userId === 'simulated-human', async send(body) { console.log(`\n[Simulated phone]\n${body}`); return 1; } };
const relay = new Relay(store, [channel]);
try {
  console.log('OFFLINE DEMO — simulated human response, no operation will execute.');
  const r = await relay.create({ taskId: 'demo-task', kind: 'approval', title: 'Deploy to staging?', action: 'Deploy build abc123 to staging only.' });
  await relay.receive('demo', { userId: 'simulated-human', text: `approve ${r.id}` });
  console.log(`\n[Agent] request=${r.id}; status=${store.get(r.id).status}; same task=demo-task`);
  console.log('The real adapter would return this decision to the originating request.');
} finally { store.close(); }
