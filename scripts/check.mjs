import { readdirSync,readFileSync,existsSync } from 'node:fs';
import { join,dirname,resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
function walk(dir) {return readdirSync(dir,{withFileTypes:true}).flatMap(e=>
  ['node_modules','.git','data'].includes(e.name)?[]:e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);}
const files=walk('.');let checked=0;
for(const f of files) {
  if(f.endsWith('.mjs')){execFileSync(process.execPath,['--check',f],{stdio:'pipe'});checked++;}
  if(f.endsWith('.json'))JSON.parse(readFileSync(f,'utf8'));
  if(f.endsWith('.md'))for(const m of readFileSync(f,'utf8').matchAll(/\]\(([^)\s]+)\)/g)) {
    const link=m[1].split('#')[0];if(!link||/^[a-z]+:/i.test(link))continue;
    assert.ok(existsSync(resolve(dirname(f),link)),`${f}: broken local link ${link}`);
  }
}
const pkg=JSON.parse(readFileSync('package.json'));
for(const f of ['plugin.json','.claude-plugin/plugin.json']) {
  const value=JSON.parse(readFileSync(f));assert.equal(value.name,pkg.name);assert.equal(value.version,pkg.version);
}
const skill=readFileSync('skills/donerelay/SKILL.md','utf8');assert.match(skill,/^---\nname: donerelay\n/);
assert.ok(existsSync('skills/donerelay/scripts/client.mjs'));
assert.equal(Object.keys(pkg.dependencies||{}).length,0);
console.log(`Checked ${checked} JavaScript files, JSON metadata and local documentation links.`);
