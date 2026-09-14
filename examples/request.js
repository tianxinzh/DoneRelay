import { ensureLocal } from '../skills/donerelay/scripts/runtime/local.js';
const client = await ensureLocal();
const request = await client.create({ kind: 'question', task: 'demo-no-execution',
  message: 'Which database should this example use: SQLite or PostgreSQL?', ttlSeconds: 300 });
console.log(`Reply to request ${request.id} directly in Telegram. No command will be executed.`);
console.log(await client.wait(request.id));
