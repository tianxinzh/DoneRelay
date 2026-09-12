import test from 'node:test';
import assert from 'node:assert/strict';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../src/core.mjs';
import { createApp } from '../src/server.mjs';
import { Client,exitCode } from '../skills/donerelay/scripts/client.mjs';
import { WechatTransport,registerCommands } from '../integrations/openclaw/transport.mjs';
import { commandApproval } from '../integrations/codex/approval-handler.mjs';
const exec=promisify(execFile),agent='a'.repeat(32),transport='b'.repeat(32);
async function setup(t) {
  const s=new Store(),config={apiToken:agent,wechatToken:transport,wechatUser:'wx-test',wechatTarget:'wx-test',telegram:{token:'test'}};
  const server=createApp(config,s);await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await new Promise(r=>server.close(r));s.close();});
  const client=new Client({url,token:agent});return {s,url,client};
}
test('real HTTP request, simulated WeChat send/reply, and client resume',async t=>{
  const {s,url,client}=await setup(t);const r=await client.create({kind:'approve',channel:'wechat',title:'Ship?',action:'deploy staging'});
  const calls=[];const w=new WechatTransport({url,token:transport,executeImpl:async(...args)=>calls.push(args)});
  assert.equal(await w.once(),true);assert.equal(calls[0][0],'openclaw');assert.ok(calls[0][1].includes('openclaw-weixin'));
  let command;registerCommands({pluginConfig:{senderId:'wx-test'},registerCommand:c=>command=c},w);
  assert.equal(command.requireAuth,true);
  const result=await command.handler({channelId:'openclaw-weixin',isAuthorizedSender:true,senderId:'wx-test',args:`approve ${r.id}`});
  assert.match(result.text,/approved/);assert.equal((await client.wait(r.id)).status,'approved');assert.equal(s.get(r.id).status,'approved');
});
test('agent credential cannot post human decisions; wrong transport sender rejected',async t=>{
  const {url}=await setup(t);
  for(const [token,sender,status] of [[agent,'wx-test',401],[transport,'attacker',403]]) {
    const r=await fetch(url+'/v1/wechat/reply',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
      body:JSON.stringify({senderId:sender,text:'approve '+'a'.repeat(24)})});assert.equal(r.status,status);
  }
});
test('reject browser origin, oversized body, malformed JSON, and unknown fields',async t=>{
  const {url}=await setup(t);const headers={authorization:`Bearer ${agent}`,'content-type':'application/json'};
  const cases=[['{}',{...headers,origin:'https://bad.invalid'},403],['a'.repeat(17000),headers,413],['{bad',headers,400],
    [JSON.stringify({kind:'notify',title:'hi',secret:'bad'}),headers,400]];
  for(const [body,h,status] of cases){const r=await fetch(url+'/v1/requests',{method:'POST',headers:h,body});assert.equal(r.status,status);}
});
test('OpenClaw command never trusts args over authenticated host context',async()=>{
  let command,n=0;registerCommands({pluginConfig:{senderId:'wx-test',accountId:'main'},registerCommand:c=>command=c},
    {call:async()=>{n++;return {status:'approved',id:'x'};}});
  const base={channelId:'openclaw-weixin',senderId:'wx-test',isAuthorizedSender:true,accountId:'main',args:'approve '+'a'.repeat(24)};
  for(const patch of [{senderId:'evil'},{isAuthorizedSender:false},{channelId:'telegram'},{accountId:'other'}])
    assert.match((await command.handler({...base,...patch})).text,/unauthorized/);
  assert.equal(n,0);
});
test('client enforces HTTPS off loopback; pending is not approval',()=>{
  assert.throws(()=>new Client({url:'http://example.com',token:agent}));assert.throws(()=>new WechatTransport({url:'http://example.com',token:transport}));
  assert.equal(exitCode({status:'pending'}),3);assert.equal(exitCode({status:'rejected'}),2);
});
test('client wait aborts and times out without an implicit approval',async t=>{
  const {client}=await setup(t);const r=await client.create({kind:'ask',channel:'wechat',title:'Which?'});
  await assert.rejects(()=>client.wait(r.id,{timeoutMs:0,intervalMs:1}),/NOT approved/);
  await assert.rejects(()=>client.wait(r.id,{signal:AbortSignal.abort()}));assert.equal((await client.status(r.id)).status,'pending');
  assert.equal((await client.cancel(r.id)).status,'cancelled');
});
test('portable CLI runs outside the repository working directory',async t=>{
  const {url}=await setup(t);const script=new URL('../skills/donerelay/scripts/client.mjs',import.meta.url).pathname;
  const {stdout}=await exec(process.execPath,[script,'notify','--title','done','--channel','wechat','--no-wait'],
    {cwd:'/tmp',env:{...process.env,DONERELAY_URL:url,DONERELAY_API_TOKEN:agent}});
  assert.equal(JSON.parse(stdout).status,'pending');
});
const params={threadId:'t',turnId:'u',itemId:'i',command:'echo test',cwd:'/work'};
test('Codex handler accepts only the exact operation and only once per callback',async t=>{
  const {client,s}=await setup(t);const original=client.wait.bind(client);
  client.wait=async(id,options)=>{const r=s.claim('wechat');s.ack(r.id,r.lease,true);s.resolve(r.id,'wechat','wx-test','approve');return original(id,options);};
  assert.deepEqual(await commandApproval(params,{client,channel:'wechat',signal:new AbortController().signal}),{decision:'accept'});
});
test('Codex missing lifecycle signal, widened scope, truncation and cancellation fail closed',async()=>{
  let calls=0;const client={create:()=>{calls++;throw new Error();}},signal=new AbortController().signal;
  for(const p of [{...params,additionalPermissions:{}},{...params,command:'x'.repeat(1700)},{...params,cwd:''},
    {...params,availableDecisions:['acceptForSession']}])assert.deepEqual(await commandApproval(p,{client,signal}),{decision:'decline'});
  assert.deepEqual(await commandApproval(params,{client}),{decision:'decline'});
  assert.deepEqual(await commandApproval(params,{client,signal:AbortSignal.abort()}),{decision:'decline'});assert.equal(calls,0);
});

test('Codex rejects tampered result binding and cancels obsolete requests',async()=>{
  let cancellations=0;
  const client={create:async()=>({id:'test'}),wait:async()=>({id:'other',kind:'approve',status:'approved',action:'different',actionHash:'wrong'}),
    cancel:async()=>{cancellations++;}};
  assert.deepEqual(await commandApproval(params,{client,signal:new AbortController().signal}),{decision:'decline'});
  assert.equal(cancellations,1);
});
