import fs from 'node:fs';
import { localPaths, readPrivate, writePrivate, connection, privateDirectory } from './local.js';
import { serve } from './server.js';
import { VERSION } from './version.js';

const paths = localPaths();
let service;
try {
  privateDirectory(paths.home);
  const config = readPrivate(paths.config);
  const credentials = connection(paths);
  let closing = false;
  const close = async () => {
    if (closing) return; closing = true;
    try { await service?.close(); }
    finally { fs.rmSync(paths.runtime, { force: true }); }
  };
  service = await serve({ ...config, DONERELAY_API_TOKEN: credentials.token,
    DONERELAY_STATE_FILE: paths.state, PORT: '0', HOST: '127.0.0.1' }, { instanceId: credentials.instanceId, stop: close });
  // Replace the generic signal handlers so the local connection record is also removed.
  process.removeListener('SIGINT', service.close); process.removeListener('SIGTERM', service.close);
  process.once('SIGINT', close); process.once('SIGTERM', close);
  writePrivate(paths.runtime, { origin: `http://127.0.0.1:${service.server.address().port}`, pid: process.pid,
    instanceId: credentials.instanceId, version: VERSION });
} catch {
  // Parent reports a fixed error. No provider credentials or response bodies enter logs.
  await service?.close();
  process.exitCode = 1;
}
