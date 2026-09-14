#!/usr/bin/env node
// Repository-owned checks; not a substitute for an official host validator.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const json = p => JSON.parse(read(p));
const check = (condition, message) => assert.ok(condition, message);
const metadataOnly = process.argv.includes('--metadata-only');
check(process.argv.slice(2).every(x => x === '--metadata-only'), 'Unknown argument');

const pkg = json('package.json');
// npm deliberately excludes package-lock.json from installed tarballs.
const lock = fs.existsSync(path.join(root, 'package-lock.json')) ? json('package-lock.json') : null;
check(lock || !fs.existsSync(path.join(root, '.git')), 'Source checkout is missing its lockfile');
const portable = json('plugin.json');
const claude = json('.claude-plugin/plugin.json');
const catalog = json('.claude-plugin/marketplace.json');
const openaiCatalog = json('.agents/plugins/marketplace.json');
const url = 'https://github.com/tianxinzh/DoneRelay';
const allowed = ['$schema', 'name', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords', 'extensions'];
check(Object.keys(portable).every(key => allowed.includes(key)), 'Unknown portable manifest field');
check(portable.$schema === 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', 'Unexpected schema');
check(/^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(portable.name), 'Invalid plugin slug');
for (const manifest of [pkg, portable, claude]) {
  check(manifest.name === 'donerelay', 'Do not rename the installed slug');
  check(manifest.version === pkg.version, 'Version mismatch');
  check(manifest.license === 'MIT', 'License mismatch');
  check(manifest.description.includes('Telegram'), 'Description must explain the primary channel');
  check(manifest.description.includes('experimental WeChat'), 'Preserve WeChat maturity label');
  check(Array.isArray(manifest.keywords) && manifest.keywords.includes('codex') && manifest.keywords.includes('claude-code'), 'Missing integration keywords');
}
if (lock) check(lock.version === pkg.version && lock.packages[''].version === pkg.version, 'Lockfile version mismatch');
check(portable.repository === url && claude.repository === url, 'Repository mismatch');
check(portable.extensions['com.openai'].interface.displayName === 'DoneRelay', 'OpenAI branding mismatch');
for (const manifest of [catalog, openaiCatalog]) {
  check(manifest.name === 'donerelay-plugins', 'Catalog slug mismatch');
  check(manifest.plugins.length === 1 && manifest.plugins[0].name === 'donerelay', 'Unexpected catalog entries');
}
check(catalog.plugins[0].source === './', 'Claude catalog must point to repository root');
const entry = openaiCatalog.plugins[0];
check(entry.source.source === 'local' && entry.source.path === './', 'OpenAI catalog must point to repository root');
check(entry.policy.installation === 'AVAILABLE' && entry.policy.authentication === 'ON_INSTALL' && entry.category === 'Productivity', 'Missing OpenAI catalog policy');
for (const p of ['skills', 'plugin.json', '.claude-plugin', '.agents/plugins', 'llms.txt']) {
  check(pkg.files.includes(p), `npm package omits ${p}`);
}
const skill = read('skills/donerelay/SKILL.md');
check(skill.startsWith('---\nname: donerelay\ndescription: '), 'Skill front matter missing');
check(skill.includes('user explicitly requests') && skill.includes('native host permissions'), 'Skill consent boundaries missing');
check(read('skills/donerelay/agents/openai.yaml').includes('allow_implicit_invocation: false'), 'Preserve explicit invocation');
check(read('README.md').includes(pkg.version) && read('README.zh-CN.md').includes(pkg.version), 'README version mismatch');
check(read('CHANGELOG.md').includes(pkg.version), 'Changelog version missing');
check(read('docs/SUBMISSION.md').includes('Not submitted'), 'Submission status must remain explicit');
for (const p of ['skills/donerelay/scripts/relay.mjs', 'skills/donerelay/references/setup.md', 'skills/donerelay/scripts/runtime/cli.js', 'skills/donerelay/scripts/runtime/local.js', 'skills/donerelay/scripts/runtime/daemon.js', 'skills/donerelay/scripts/runtime/package.json', 'skills/donerelay/scripts/runtime/slack.js', 'skills/donerelay/scripts/runtime/slack-requests.js', 'skills/donerelay/references/slack.md']) {
  check(fs.existsSync(path.join(root, p)), `Missing bundled skill resource: ${p}`);
}

let checkedLinks = 0;
if (!metadataOnly) {
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (['.git', 'node_modules', 'data'].includes(entry.name)) return [];
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) return [];
    return entry.isDirectory() ? walk(full) : [full];
  });
  const files = walk(root).filter(p => /\.(md|txt)$/.test(p));
  for (const file of files) {
    // Local file destinations only. Network reachability and Markdown anchor IDs
    // are deliberately not claimed by this dependency-free check.
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
      const target = match[1];
      if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target)) continue;
      const relative = decodeURIComponent(target.split(/[?#]/)[0]);
      if (!relative) continue;
      const absolute = path.resolve(path.dirname(file), relative);
      check(!path.relative(root, absolute).startsWith('..'), `Link escapes repository: ${target}`);
      check(fs.existsSync(absolute), `Broken local file link in ${path.relative(root, file)}: ${target}`);
      checkedLinks++;
    }
  }
}
console.log(`Discovery metadata checks passed; ${metadataOnly ? 'local-file link checks skipped (--metadata-only)' : `${checkedLinks} local file links checked`}.`);
console.log('This does not validate a host installation, live messaging, external URLs, directory admission, or search ranking.');
