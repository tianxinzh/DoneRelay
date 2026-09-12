import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (path.endsWith('.mjs')) {
      const check = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' });
      assert.equal(check.status, 0, `Syntax failed: ${path}`);
    } else if (path.endsWith('.json')) JSON.parse(readFileSync(path, 'utf8'));
  }
}
walk('.');
const skill = readFileSync('skills/donerelay/SKILL.md', 'utf8');
assert.match(skill, /^---\nname: donerelay\ndescription: /);
const plugin = JSON.parse(readFileSync('.claude-plugin/plugin.json', 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
assert.equal(plugin.version, pkg.version);
console.log('JavaScript syntax, JSON, skill metadata and version consistency checks passed.');
