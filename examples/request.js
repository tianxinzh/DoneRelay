import { Client } from '../src/client.js';
const client = new Client();
const request = await client.create({ kind: 'question', task: 'demo-no-execution',
  message: 'Which database should this example use: SQLite or PostgreSQL?', ttlSeconds: 300 });
console.log(`Reply to request ${request.id} in a configured chat. No command will be executed.`);
console.log(await client.wait(request.id));
