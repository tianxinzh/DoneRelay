import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { configureLocal, ensureLocal, localStatus, stopLocal, uninstallLocal, localPaths, readPrivate, writePrivate } from '../skills/donerelay/scripts/runtime/local.js';
import { validateTelegram } from '../skills/donerelay/scripts/runtime/setup.js';
const config = { TELEGRAM_BOT_TOKEN: '123:' + 'fixture'.repeat(5), TELEGRAM_USER_ID: '10', TELEGRAM_CHAT_ID: '10', DONERELAY_LANGUAGE: 'en' };
const fixture = path.resolve('scripts/fixtures/local-daemon.mjs');
const options = { spawnImpl: (exe, args, opts) => spawn(exe, [fixture, ...args], opts) };
async function home(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'donerelay-local-'));
  const env = { ...process.env, DONERELAY_HOME: path.join(dir, 'private') };
  t.after(async () => {
    try {
      const statePath=localPaths(env).state;
      if(fs.existsSync(statePath)) {
        const data=JSON.parse(fs.readFileSync(statePath));
        const client=await ensureLocal(env,options);
        for(const r of Object.values(data.requests)) if(r.status==='pending') await client.cancel(r.id);
      }
      await stopLocal(env);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  await configureLocal(config, env);
  return { env, paths: localPaths(env), dir };
}
test('setup creates owner-only local secrets and no public URL; invalid and repeated setup are rejected', async t => {
  const f = await home(t);
  const credentials = readPrivate(f.paths.connection);
  assert.equal(credentials.token.length, 64); assert.equal(credentials.instanceId.length, 32);
  assert.equal(fs.statSync(f.paths.config).mode & 0o777, 0o600);
  assert.equal(fs.statSync(f.paths.home).mode & 0o777, 0o700);
  assert.deepEqual(await localStatus(f.env), { configured: true, running: false, version: '0.1.0-alpha.6' });
  await assert.rejects(configureLocal(config, f.env), /already configured/);
  await assert.rejects(configureLocal({ ...config, TELEGRAM_CHAT_ID: '20' }, { DONERELAY_HOME: path.join(f.dir,'invalid') }), /private chat/);
});
test('concurrent starts reuse one detached process, discard agent credentials, and ignore external connection variables', async t => {
  const f = await home(t); let spawns=0;
  const env={...f.env,NODE_OPTIONS:'--this-must-never-reach-the-service',OPENAI_API_KEY:'fixture-agent-key',DONERELAY_URL:'https://not-used.invalid',DONERELAY_API_TOKEN:'unrelated-token'};
  const opts={spawnImpl:(exe,args,opts)=>{
    spawns++; assert.equal(opts.env.NODE_OPTIONS,undefined); assert.equal(opts.env.OPENAI_API_KEY,undefined);
    assert.equal(opts.env.TELEGRAM_BOT_TOKEN,undefined); assert.equal(opts.detached,true);
    return options.spawnImpl(exe,args,opts);
  }};
  const clients=await Promise.all(Array.from({length:5},()=>ensureLocal(env,opts)));
  assert.equal(spawns,1); assert.equal(new Set(clients.map(c=>c.origin)).size,1);
  assert.match(clients[0].origin,/^http:\/\/127\.0\.0\.1:\d+$/);
  const status=await localStatus(f.env);assert.equal(status.running,true);assert.equal(status.compatible,true);
  assert.ok(!JSON.stringify(status).includes(readPrivate(f.paths.connection).token));
  await stopLocal(f.env);assert.equal((await localStatus(f.env)).running,false);
});
test('a direct Telegram reply resumes the same local caller; stop and purge refuse pending requests', async t => {
  const f=await home(t);const client=await ensureLocal(f.env,options);
  const request=await client.create({kind:'question',task:'test',message:'Choose READY',ttlSeconds:60});
  const waiting=client.wait(request.id);
  await assert.rejects(stopLocal(f.env),/pending/);
  await assert.rejects(uninstallLocal(f.env,{purge:true}),/pending/);
  assert.ok(fs.existsSync(f.paths.config));
  writePrivate(path.join(f.paths.home,'fixture-inbox.json'),{message:{from:{id:10},chat:{id:10,type:'private'},text:'READY',reply_to_message:{message_id:Number(request.deliveries.telegram.providerMessageId),chat:{id:10,type:'private'},from:{id:123,is_bot:true}}}});
  const result=await waiting;assert.equal(result.status,'answered');assert.equal(result.answer,'READY');
  assert.equal(result.resolvedBy.telegramReplyToMessageId,request.deliveries.telegram.providerMessageId);
  await stopLocal(f.env);await ensureLocal(f.env,options);
  const next=await ensureLocal(f.env,options);assert.equal((await next.get(request.id)).status,'answered');
});
test('crashed service is recovered on next invocation and pending approvals are cancelled', async t => {
  const f=await home(t);const client=await ensureLocal(f.env,options);
  const request=await client.create({kind:'approval',task:'test',message:'Create exactly one disposable marker',ttlSeconds:60});
  const first=await localStatus(f.env);process.kill(first.pid,'SIGKILL');
  for(let n=0;n<50;n++){await delay(30);const status=await localStatus(f.env);if(!status.processAlive)break;}
  const resumed=await ensureLocal(f.env,options);
  assert.notEqual((await localStatus(f.env)).pid,first.pid);
  assert.equal((await resumed.get(request.id)).status,'cancelled');
});
test('copied skill bundle runs without repository files or manual environment exports', async t => {
  const f=await home(t);await ensureLocal(f.env,options);
  const copied=path.join(f.dir,'copied');fs.cpSync('skills/donerelay',copied,{recursive:true});
  const cli=path.join(copied,'scripts/relay.mjs');
  const run=(args,input)=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[cli,...args],{cwd:f.dir,env:{PATH:process.env.PATH,DONERELAY_HOME:f.paths.home},stdio:['pipe','pipe','pipe']});let out='',err='';
    child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);
    child.on('close',code=>(code===0 || (args[0]==='cancel' && code===2))?resolve(JSON.parse(out)):reject(Error(err || out)));child.stdin.end(input?JSON.stringify(input):'');
  });
  assert.equal((await run(['status'])).running,true);
  assert.deepEqual(await run(['preferences']),{language:'en'});
  const question=await run(['create'],{kind:'question',task:'copy',message:'Answer this',language:'zh'});
  assert.equal(question.language,'zh');await run(['cancel',question.id]);
  await run(['stop']);assert.equal((await localStatus(f.env)).running,false);
});
test('local lifecycle rejects symlinks, permissive credentials, live orphan locks, and mismatched service identities', async t => {
  const f=await home(t);
  fs.chmodSync(f.paths.connection,0o644);await assert.rejects(ensureLocal(f.env,options),/owner-only/);fs.chmodSync(f.paths.connection,0o600);
  const credentials=readPrivate(f.paths.connection);
  fs.unlinkSync(f.paths.connection);writePrivate(path.join(f.dir,'elsewhere.json'),credentials);fs.symlinkSync(path.join(f.dir,'elsewhere.json'),f.paths.connection);
  await assert.rejects(ensureLocal(f.env,options),/owner-only/);fs.unlinkSync(f.paths.connection);writePrivate(f.paths.connection,credentials);
  fs.writeFileSync(f.paths.state+'.lock',String(process.pid),{mode:0o600});
  await assert.rejects(ensureLocal(f.env,options),/locked/);await assert.rejects(uninstallLocal(f.env,{purge:true}),/owned by/);
  assert.ok(fs.existsSync(f.paths.config));fs.unlinkSync(f.paths.state+'.lock');
  await ensureLocal(f.env,options);const record=readPrivate(f.paths.runtime);
  writePrivate(f.paths.runtime,{...record,instanceId:'a'.repeat(32)});
  await assert.rejects(stopLocal(f.env),/Invalid local service record/);writePrivate(f.paths.runtime,record);
});
test('purge removes only DoneRelay records and requires an idle service', async t => {
  const f=await home(t);await ensureLocal(f.env,options);
  fs.writeFileSync(path.join(f.paths.home,'unrelated.txt'),'keep');
  await uninstallLocal(f.env,{purge:true});
  assert.equal(fs.existsSync(f.paths.config),false);assert.equal(fs.existsSync(f.paths.connection),false);
  assert.equal(fs.readFileSync(path.join(f.paths.home,'unrelated.txt'),'utf8'),'keep');
});
test('Telegram setup validates private identity and rejects webhooks without polling or exposing secrets', async () => {
  const methods=[];
  const provider=hook=>async(url)=>{
    const method=url.split('/').at(-1);methods.push(method);
    return new Response(JSON.stringify({ok:true,result:method==='getMe'?{is_bot:true}:method==='getChat'?{id:10,type:'private'}:{url:hook}}));
  };
  await validateTelegram(config,provider(''));assert.deepEqual(methods,['getMe','getChat','getWebhookInfo']);
  await assert.rejects(validateTelegram(config,provider('https://example.invalid/hook')),/private chat.*webhook/);
});

test('a running incompatible bundle is preserved and cannot silently accept a new-version caller', async t => {
  const f=await home(t);const old=path.join(f.dir,'older-skill');fs.cpSync('skills/donerelay',old,{recursive:true});
  fs.writeFileSync(path.join(old,'scripts/runtime/version.js'),"export const VERSION = '0.0.0-fixture';\n");
  const daemon=path.join(old,'scripts/runtime/daemon.js');
  await assert.rejects(ensureLocal(f.env,{spawnImpl:(exe,_args,opts)=>options.spawnImpl(exe,[daemon],opts)}),/version mismatch/);
  const first=await localStatus(f.env);assert.equal(first.running,true);assert.equal(first.compatible,false);
  await assert.rejects(ensureLocal(f.env,options),/different DoneRelay version/);
  assert.equal((await localStatus(f.env)).pid,first.pid);
  await stopLocal(f.env);
});
test('unauthenticated lifecycle calls cannot stop a healthy local service', async t => {
  const f=await home(t);const client=await ensureLocal(f.env,options);
  const response=await fetch(`${client.origin}/v1/local/stop`,{method:'POST'});
  assert.equal(response.status,401);assert.equal((await localStatus(f.env)).running,true);
});
test('hidden setup input never echoes the token and restores terminal state on cancellation', async () => {
  const {PassThrough}=await import('node:stream');const {hiddenInput}=await import('../skills/donerelay/scripts/runtime/setup.js');
  const input=new PassThrough();const output=new PassThrough();input.isTTY=true;output.isTTY=true;
  input.setRawMode=value=>{input.isRaw=value};let rendered='';output.on('data',b=>{if(b.toString().startsWith('Token'))assert.equal(input.isRaw,true);rendered+=b});
  const secret=hiddenInput('Token (hidden): ',input,output);input.write('fixture-secret\r');
  assert.equal(await secret,'fixture-secret');assert.doesNotMatch(rendered,/fixture-secret/);assert.equal(input.isRaw,false);
  const cancelled=hiddenInput('Token (hidden): ',input,output);input.write('fixture\u0003');
  await assert.rejects(cancelled,/cancelled/);assert.equal(input.isRaw,false);assert.doesNotMatch(rendered,/fixture/);
});
test('local doctor checks configuration, service and provider read-only without printing credentials', async t => {
  const f=await home(t);const {localDoctor}=await import('../skills/donerelay/scripts/runtime/local.js');
  const calls=[];const provider=async url=>{
    const method=url.split('/').at(-1);calls.push(method);
    return new Response(JSON.stringify({ok:true,result:method==='getMe'?{is_bot:true}:method==='getChat'?{id:10,type:'private'}:{url:''}}));
  };
  const stopped=await localDoctor(f.env,{fetchImpl:provider});
  assert.equal(stopped.ok,false);assert.equal((await localStatus(f.env)).running,false);assert.equal(fs.existsSync(f.paths.runtime),false);
  await ensureLocal(f.env,options);const healthy=await localDoctor(f.env,{fetchImpl:provider});
  assert.equal(healthy.ok,true);assert.match(healthy.checks.find(x=>x.name==='local_service').guidance,/running and authenticated/);
  assert.doesNotMatch(JSON.stringify(healthy),/fixture/);assert.ok(!JSON.stringify(healthy).includes(readPrivate(f.paths.connection).token));
  assert.ok(calls.every(method=>['getMe','getChat','getWebhookInfo'].includes(method)));
});
