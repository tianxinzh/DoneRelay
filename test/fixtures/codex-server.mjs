// Protocol simulator, never executes a command or calls an LLM.
import { createInterface } from 'node:readline';
const send = msg => console.log(JSON.stringify(msg));
createInterface({ input: process.stdin }).on('line', line => {
  const m = JSON.parse(line);
  if (m.method === 'initialize') send({ id: m.id, result: { userAgent: 'fixture' } });
  if (m.method === 'thread/start') send({ id: m.id, result: { thread: { id: 'thread-test' } } });
  if (m.method === 'turn/start') {
    send({ id: m.id, result: { turn: { id: 'turn-test' } } });
    send({ method: 'item/started', params: { threadId: 'thread-test', item: { id: 'cmd', type: 'commandExecution', command: 'echo test' } } });
    send({ id: 77, method: 'item/commandExecution/requestApproval', params: { threadId: 'thread-test', turnId: 'turn-test', itemId: 'cmd', command: 'echo test' } });
  }
  if (m.id === 77 && m.result?.decision === 'accept') {
    send({ method: 'serverRequest/resolved', params: { threadId: 'thread-test', requestId: 77 } });
    send({ id: 78, method: 'item/tool/requestUserInput', params: { threadId: 'thread-test', turnId: 'turn-test', itemId: 'q',
      questions: [{ id: 'database', header: 'Database', question: 'Choose a database', options: [{ label: 'SQLite', description: 'Local' }] }] } });
  }
  if (m.id === 78 && m.result?.answers?.database?.answers?.[0] === 'SQLite') {
    send({ method: 'item/completed', params: { threadId: 'thread-test', item: { id: 'answer', type: 'agentMessage', text: 'Fixture completed using SQLite.' } } });
    send({ method: 'turn/completed', params: { threadId: 'thread-test', turn: { id: 'turn-test', status: 'completed' } } });
  }
});
