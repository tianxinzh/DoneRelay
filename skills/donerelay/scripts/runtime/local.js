import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from './client.js';
import { VERSION } from './version.js';
import { check, delay, RelayError } from './util.js';

export function localPaths(env = process.env) {
  const home = path.resolve(env.DONERELAY_HOME || path.join(os.homedir(), '.config', 'donerelay', 'local'));
  return { home, config: path.join(home, 'config.json'), connection: path.join(home, 'connection.json'),
    runtime: path.join(home, 'runtime.json'), state: path.join(home, 'state.json'), lock: path.join(home, 'control.lock') };
}
export function privateDirectory(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(dir);
  check(stat.isDirectory() && !stat.isSymbolicLink() && (process.getuid === undefined || stat.uid === process.getuid()), 'DoneRelay directory must be owned by this user and cannot be a symlink.');
  fs.chmodSync(dir, 0o700);
}
function verifyDirectory(dir) {
  const stat = fs.lstatSync(dir);
  check(stat.isDirectory() && !stat.isSymbolicLink() && (process.getuid === undefined || stat.uid === process.getuid()) && (stat.mode & 0o077) === 0,
    'DoneRelay directory must be owned by this user with owner-only permissions.');
}
export function readPrivate(file) {
  const stat = fs.lstatSync(file);
  check(stat.isFile() && !stat.isSymbolicLink() && (process.getuid === undefined || stat.uid === process.getuid()) && (stat.mode & 0o077) === 0,
    'DoneRelay configuration must be an owner-only regular file.');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
export function writePrivate(file, value) {
  const temporary = `${file}.${randomBytes(8).toString('hex')}.tmp`;
  try { fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' }); fs.renameSync(temporary, file); }
  finally { fs.rmSync(temporary, { force: true }); }
}
function alive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}
async function controlled(paths, action) {
  privateDirectory(paths.home);
  let fd;
  for (let n = 0; n < 120; n++) {
    try { fd = fs.openSync(paths.lock, 'wx', 0o600); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      // Never delete an ambiguous lock or signal a PID from an unverified file.
      await delay(100);
    }
  }
  check(fd !== undefined, 'Another lifecycle operation is running or its control.lock is stale. Run doctor; no second service was started.', 409);
  try { fs.writeFileSync(fd, String(process.pid)); return await action(); }
  finally { fs.closeSync(fd); fs.unlinkSync(paths.lock); }
}
export function connection(paths = localPaths()) {
  check(fs.existsSync(paths.connection), 'DoneRelay is not configured. Run setup in your terminal.');
  const value = readPrivate(paths.connection);
  check(typeof value.token === 'string' && /^[a-f0-9]{64}$/.test(value.token) && /^[a-f0-9]{32}$/.test(value.instanceId), 'Invalid local connection settings; run doctor.');
  return value;
}
function runtime(paths, credentials) {
  if (!fs.existsSync(paths.runtime)) return null;
  const record = readPrivate(paths.runtime);
  let url; try { url = new URL(record.origin); } catch { throw new RelayError('Invalid local service record; run doctor.'); }
  check(url.protocol === 'http:' && url.hostname === '127.0.0.1' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash && url.port &&
    Number.isSafeInteger(record.pid) && record.pid > 0 && record.instanceId === credentials.instanceId,
  'Invalid local service record; run doctor.');
  return record;
}
async function serviceCall(record, credentials, route, method = 'GET') {
  return fetch(`${record.origin}/v1/local/${route}`, { method, redirect: 'error',
    headers: { Authorization: `Bearer ${credentials.token}` }, signal: AbortSignal.timeout(1500) });
}
export async function localStatus(env = process.env) {
  const paths = localPaths(env);
  if (!fs.existsSync(paths.connection)) return { configured: false, running: false, version: VERSION };
  verifyDirectory(paths.home);
  const credentials = connection(paths);
  const record = runtime(paths, credentials);
  if (!record) return { configured: true, running: false, version: VERSION };
  let response;
  try { response = await serviceCall(record, credentials, 'status'); }
  catch { return { configured: true, running: false, processAlive: alive(record.pid), version: VERSION }; }
  check(response.ok, 'Local service authentication failed; run doctor.');
  const result = await response.json();
  check(result.instanceId === credentials.instanceId && result.pid === record.pid, 'Local service identity mismatch; no lifecycle action taken.');
  return { configured: true, running: result.accepting === true, version: result.version,
    compatible: result.version === VERSION, pending: result.pending, pid: result.pid, processAlive: true };
}
export async function configureLocal(config, env = process.env) {
  const paths = localPaths(env);
  return controlled(paths, async () => {
    check(!fs.existsSync(paths.config) && !fs.existsSync(paths.connection), 'DoneRelay is already configured. Use status or uninstall --purge before setting it up again.');
    check(config && typeof config.TELEGRAM_BOT_TOKEN === 'string' && /^\d+:[A-Za-z0-9_-]{20,}$/.test(config.TELEGRAM_BOT_TOKEN), 'Invalid Telegram bot token.');
    check(/^[1-9]\d*$/.test(config.TELEGRAM_USER_ID) && config.TELEGRAM_USER_ID === config.TELEGRAM_CHAT_ID, 'Use the bound user ID as the private chat ID.');
    check(['auto', 'en', 'zh'].includes(config.DONERELAY_LANGUAGE ?? 'auto'), 'Language must be auto, en, or zh.');
    const clean = Object.fromEntries(['TELEGRAM_BOT_TOKEN', 'TELEGRAM_USER_ID', 'TELEGRAM_CHAT_ID', 'DONERELAY_LANGUAGE'].filter(k => config[k] !== undefined).map(k => [k, config[k]]));
    writePrivate(paths.config, clean);
    try { writePrivate(paths.connection, { token: randomBytes(32).toString('hex'), instanceId: randomBytes(16).toString('hex') }); }
    catch (error) { fs.unlinkSync(paths.config); throw error; }
    return { configured: true, version: VERSION };
  });
}
export async function ensureLocal(env = process.env, { spawnImpl = spawn } = {}) {
  const paths = localPaths(env);
  return controlled(paths, async () => {
    const credentials = connection(paths);
    const current = await localStatus(env);
    if (current.running) {
      check(current.compatible, 'A different DoneRelay version is running. Finish pending requests, then run stop and start from the updated bundle.', 409);
      return clientFor(paths, credentials, env);
    }
    check(!current.processAlive, 'The local service process is alive but unavailable. Run doctor; it was not restarted.', 409);
    check(fs.existsSync(paths.config), 'Local setup is incomplete. Run setup in your terminal.');
    // The lifecycle lock serializes recovery. A live/unknown owner is never disturbed.
    const stateLock = `${paths.state}.lock`;
    if (fs.existsSync(stateLock)) {
      const owner = fs.readFileSync(stateLock, 'utf8');
      check(/^\d+$/.test(owner) && Number(owner) > 0 && !alive(Number(owner)), 'Local state is locked by a live or unknown process; run doctor.', 409);
      fs.unlinkSync(stateLock);
    }
    fs.rmSync(paths.runtime, { force: true });
    const daemon = fileURLToPath(new URL('./daemon.js', import.meta.url));
    // Only standard runtime variables enter the service, never arbitrary NODE_OPTIONS or agent credentials.
    const childEnv = Object.fromEntries(['PATH', 'HOME', 'USERPROFILE', 'SYSTEMROOT', 'TMPDIR', 'TEMP', 'LANG'].filter(k => env[k] !== undefined).map(k => [k, env[k]]));
    childEnv.DONERELAY_HOME = paths.home;
    const child = spawnImpl(process.execPath, [daemon], { cwd: paths.home, env: childEnv, detached: true, stdio: 'ignore' });
    let failed = false; child.on('error', () => { failed = true; }); child.unref();
    for (let n = 0; n < 100; n++) {
      await delay(100);
      if (failed) break;
      const status = await localStatus(env);
      if (status.running) {
        check(status.compatible, 'Local service version mismatch.');
        return clientFor(paths, credentials, env);
      }
      if (child.exitCode !== null) break;
    }
    throw new RelayError('Local service did not become ready. Run doctor; no message or approval was assumed.', 503);
  });
}
function clientFor(paths, credentials, env) {
  const record = runtime(paths, credentials);
  check(record, 'Local service has no connection record.');
  return new Client({ DONERELAY_URL: record.origin, DONERELAY_API_TOKEN: credentials.token,
    ...(env.DONERELAY_LANGUAGE === undefined ? {} : { DONERELAY_LANGUAGE: env.DONERELAY_LANGUAGE }) });
}
async function stopUnlocked(paths, env) {
  const status = await localStatus(env);
  if (!status.running) {
    check(!status.processAlive, 'The service is unavailable but its process is alive; no process was killed.', 409);
    if (fs.existsSync(`${paths.state}.lock`)) {
      const pid = Number(fs.readFileSync(`${paths.state}.lock`, 'utf8'));
      check(Number.isSafeInteger(pid) && pid > 0 && !alive(pid), 'Local state is owned by a live or unknown process; no files were removed.', 409);
    }
    return { stopped: true };
  }
  const credentials = connection(paths);
  const record = runtime(paths, credentials);
  const response = await serviceCall(record, credentials, 'stop', 'POST');
  check(response.ok, response.status === 409 ? 'Requests are pending; finish or cancel them before stopping DoneRelay.' : 'Could not stop the verified local service.', response.status);
  for (let n = 0; n < 100; n++) {
    await delay(100);
    if (!fs.existsSync(paths.runtime) && !fs.existsSync(`${paths.state}.lock`)) return { stopped: true };
  }
  throw new RelayError('The service is still shutting down. Run status before further lifecycle actions.', 409);
}
export async function stopLocal(env = process.env) {
  return controlled(localPaths(env), () => stopUnlocked(localPaths(env), env));
}
export async function uninstallLocal(env = process.env, { purge = false } = {}) {
  const paths = localPaths(env);
  return controlled(paths, async () => {
    await stopUnlocked(paths, env);
    if (purge) {
      // Delete only owned bundle records, never an arbitrary directory or host plugin installation.
      for (const name of ['config.json', 'connection.json', 'runtime.json', 'state.json']) {
        const file = path.join(paths.home, name);
        if (fs.existsSync(file)) { readPrivate(file); fs.unlinkSync(file); }
      }
      const stateLock = `${paths.state}.lock`;
      if (fs.existsSync(stateLock)) {
        const pid = Number(fs.readFileSync(stateLock, 'utf8'));
        check(Number.isSafeInteger(pid) && pid > 0 && !alive(pid), 'State lock owner is still alive or unknown.');
        fs.unlinkSync(stateLock);
      }
    }
    return { stopped: true, configurationRemoved: purge, next: 'Remove the skill or plugin through its host to finish uninstalling.' };
  });
}
export async function localDoctor(env = process.env, { fetchImpl = fetch } = {}) {
  const paths = localPaths(env); const checks = [];
  const add = (name, ok, guidance) => checks.push({ name, ok, guidance });
  add('node', Number(process.versions.node.split('.')[0]) >= 22, 'Use Node.js 22 or newer.');
  try {
    const status = await localStatus(env);
    add('local_setup', status.configured, 'Run setup in your terminal; credentials are entered privately.');
    if (status.configured) {
      const config = readPrivate(paths.config);
      add('telegram_configuration', typeof config.TELEGRAM_BOT_TOKEN === 'string' && /^[1-9]\d*$/.test(config.TELEGRAM_USER_ID) && config.TELEGRAM_USER_ID === config.TELEGRAM_CHAT_ID, 'Complete Telegram setup in your terminal.');
      add('local_service', status.running, status.running ? 'Local service is running and authenticated.' : status.processAlive ? 'Service process is alive but unavailable; inspect local service state.' : 'Run start, or invoke the skill to start the bundled service automatically.');
      if (status.running) add('bundle_version', status.compatible, 'Finish pending requests, stop the service, then start from the updated bundle.');
      try {
        const { validateTelegram } = await import('./setup.js');
        await validateTelegram(config, fetchImpl);
        add('telegram_account', true, 'Private Telegram account is reachable and has no webhook.');
      } catch { add('telegram_account', false, 'Check Telegram credentials, private chat access, network, and conflicting webhook configuration privately.'); }
    }
  } catch { add('local_setup', false, 'Configuration, permissions, or service identity is invalid. Inspect local files privately; do not share their contents.'); }
  if (fs.existsSync(paths.lock)) add('lifecycle_lock', false, 'A lifecycle operation holds control.lock. If interrupted, verify its recorded PID has stopped before removing only control.lock.');
  return { version: VERSION, ok: checks.every(c => c.ok), checks, next: 'Send a harmless question and verify your direct Telegram reply in the same waiting caller.' };
}
