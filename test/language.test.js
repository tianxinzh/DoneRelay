import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';
import { Relay, formatRequest } from '../src/relay.js';
import { Telegram } from '../src/channels/telegram.js';
import { WhatsApp } from '../src/channels/whatsapp.js';
import { Client } from '../src/client.js';
import { makeServer } from '../src/server.js';
import { resolveLanguage } from '../src/language.js';
import { questionInput } from '../src/adapters/codex.js';
function setup(t, language='auto') {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'donerelay-language-'));const store=new Store(path.join(dir,'state.json'));
  const sent=[];
  const telegram=new Telegram({token:'123:fixture',chatId:'10',userId:'10',store,fetchImpl:async(url,options)=>{sent.push({method:url.split('/').at(-1),body:JSON.parse(options.body)});return new Response(JSON.stringify({ok:true,result:{}}));}});
  const relay=new Relay(store,{telegram},Date.now,language);telegram.relay=relay;
  t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true})});
  return {store,relay,telegram,sent};
}
const input={kind:'approval',task:'test',message:'Run exactly node --version.'};
const update=text=>({message:{from:{id:10,language_code:'en'},chat:{id:10,type:'private'},text}});

test('English requests have no Chinese labels and Chinese requests have no English UI labels',async t=>{
  const f=setup(t);
  const en=await f.relay.create(input);
  assert.equal(en.language,'en');assert.doesNotMatch(formatRequest(en),/\p{Script=Han}/u);
  assert.deepEqual(f.sent[0].body.reply_markup.inline_keyboard[0].map(x=>x.text),['Approve once','Deny']);
  const zh=await f.relay.create({...input,task:'测试',message:'运行 node --version。'});
  assert.equal(zh.language,'zh');const text=formatRequest(zh);
  assert.match(text,/任务: 测试/);assert.match(text,/批准 [A-F0-9]{12}/);assert.doesNotMatch(text,/APPROVAL|Task:|Request:|Expires:|approve |deny /);
  assert.ok(text.includes('node --version'));assert.deepEqual(f.sent.at(-1).body.reply_markup.inline_keyboard[0].map(x=>x.text),['批准一次','拒绝']);
});
test('saved selection survives restart, explicit request overrides it, and auto selects from content',async t=>{
  const f=setup(t);
  await f.telegram.handle(update('/language zh'));
  assert.equal(f.relay.preference(),'zh');assert.equal(f.sent.at(-1).body.text,'语言偏好已保存。');
  const zh=await f.relay.create({...input,language:undefined});assert.equal(zh.language,'zh');
  assert.equal((await f.relay.create({...input,language:'en'})).language,'en');
  assert.equal((await f.relay.create({...input,language:'auto'})).language,'en');
  f.store.close();const reopened=new Store(f.store.file);
  try{assert.equal(new Relay(reopened,{}).preference(),'zh');assert.equal(reopened.get(zh.id).language,'zh');}finally{reopened.close()}
});
test('language controls require the bound private user and cannot decide requests',async t=>{
  const f=setup(t);const r=await f.relay.create(input);
  const wrong=update('/language zh');wrong.message.from.id=11;await f.telegram.handle(wrong);
  assert.equal(f.relay.preference(),'auto');
  const group=update('/language zh');group.message.chat.type='group';await f.telegram.handle(group);assert.equal(f.relay.preference(),'auto');
  await f.telegram.handle(update('/language zh'));assert.equal(f.store.get(r.id).status,'pending');
  await f.telegram.handle(update('/language unsupported'));assert.equal(f.relay.preference(),'zh');assert.doesNotMatch(f.sent.at(-1).body.text,/Choose|English|Chinese/);
  await f.telegram.handle(update('/language auto'));assert.equal(f.relay.preference(),'auto');
});
test('acknowledgements and duplicate reply errors stay in the original request language',async t=>{
  const f=setup(t);const r=await f.relay.create({...input,language:'zh'});
  await f.telegram.handle(update('/language en'));
  await f.telegram.handle(update(`approve ${r.id}`));assert.equal(f.sent.at(-1).body.text,`${r.id}: 已批准`);
  await f.telegram.handle(update(`approve ${r.id}`));assert.match(f.sent.at(-1).body.text,/已批准/);assert.doesNotMatch(f.sent.at(-1).body.text,/already|approved/);
  assert.equal(f.store.get(r.id).status,'approved');
});
test('language validation and idempotency do not silently change a sent proposal',async t=>{
  const f=setup(t);await assert.rejects(f.relay.create({...input,language:'fr'}),/language/);
  const r=await f.relay.create({...input,idempotencyKey:'once',language:'en'});
  assert.equal((await f.relay.create({...input,idempotencyKey:'once',language:'en'})).id,r.id);
  await assert.rejects(f.relay.create({...input,idempotencyKey:'once',language:'zh'}),/different content/);
  assert.equal(resolveLanguage('auto','请选择 SQLite'),'zh');assert.equal(resolveLanguage('auto','Choose SQLite'),'en');
});
test('preferences require API authentication and client language does not mutate caller input',async t=>{
  const f=setup(t,'zh');const token='t'.repeat(32);const server=makeServer(f.relay,token);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(url+'/v1/preferences')).status,401);
  const client=new Client({DONERELAY_URL:url,DONERELAY_API_TOKEN:token,DONERELAY_LANGUAGE:'en'});
  assert.deepEqual(await client.preferences(),{language:'zh'});
  assert.equal((await client.create(input)).language,'en');assert.equal(input.language,undefined);
  assert.equal((await client.create({...input,language:'zh'})).language,'zh');
});
test('WhatsApp uses one-language button titles without changing decision payloads',async t=>{
  const f=setup(t);let body;
  const wa=new WhatsApp({token:'t'.repeat(20),phoneNumberId:'10000000001',businessAccountId:'20000000001',userId:'15555550123',appSecret:'s'.repeat(20),verifyToken:'v'.repeat(32),graphVersion:'v23.0',store:f.store,fetchImpl:async(_url,opts)=>{body=JSON.parse(opts.body);return new Response(JSON.stringify({messaging_product:'whatsapp',messages:[{id:'fixture'}]}))}});
  f.store.meta(wa.stateKey,{optedIn:true,lastInboundAt:Date.now(),seen:{}});
  await wa.send('请确认这一个操作。',{kind:'approval',id:'ABCDEF012345',language:'zh'});
  assert.deepEqual(body.interactive.action.buttons.map(b=>b.reply.title),['批准一次','拒绝']);
  assert.equal(body.interactive.action.buttons[0].reply.id,'approve ABCDEF012345');
});
test('native Chinese questions keep question scaffolding in Chinese and labels exact',()=>{
  const r=questionInput({id:'q',question:'请选择颜色',options:[{label:'BLUE',description:'蓝色'}]}, {threadId:'t',turnId:'u'},'zh');
  assert.equal(r.language,'zh');assert.match(r.message,/选项/);assert.match(r.message,/BLUE: 蓝色/);assert.doesNotMatch(r.message,/Question|Options|reply with/);
});
test('CLI override and copied standalone skill honor the same language contract',async t=>{
  const {spawn}=await import('node:child_process');
  const f=setup(t,'zh');const token='t'.repeat(32);const server=makeServer(f.relay,token);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const env={...process.env,DONERELAY_URL:`http://127.0.0.1:${server.address().port}`,DONERELAY_API_TOKEN:token,DONERELAY_LANGUAGE:'zh'};
  const run=(args,body)=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,args,{env,stdio:['pipe','pipe','pipe']});let out='',err='';
    child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);child.on('error',reject);
    child.on('close',code=>code===0?resolve(JSON.parse(out)):reject(Error(err)));
    child.stdin.end(body?JSON.stringify(body):'');
  });
  assert.equal((await run(['src/cli.js','request','--language','en'],{...input,language:'zh'})).language,'en');
  const copied=path.join(path.dirname(f.store.file),'relay.mjs');fs.copyFileSync('skills/donerelay/scripts/relay.mjs',copied);
  assert.deepEqual(await run([copied,'preferences']),{language:'zh'});
  assert.equal((await run([copied,'create'],input)).language,'zh');
});
