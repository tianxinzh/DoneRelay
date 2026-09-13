import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'donerelay-package-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
try {
  const [packed] = JSON.parse(execFileSync(npm, ['pack', '--json', '--pack-destination', dir], { cwd: root, encoding: 'utf8' }));
  execFileSync(npm, ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', dir, path.join(dir, packed.filename)], { stdio: 'pipe' });
  const installed = path.join(dir, 'node_modules/donerelay');
  assert.equal(execFileSync(process.execPath, ['src/cli.js', '--version'], { cwd: installed, encoding: 'utf8' }).trim(), packed.version);
  execFileSync(process.execPath, ['scripts/check-discovery.mjs'], { cwd: installed, stdio: 'pipe' });
  assert.ok(packed.files.some(f => f.path === 'skills/donerelay/scripts/relay.mjs'));
  assert.ok(packed.files.every(f => !/(^|\/)(?:\.env|state\.json)$/.test(f.path)));
  console.log(`Installed package ${packed.version}: CLI version, bundled skill, metadata, and local documentation links passed.`);
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
