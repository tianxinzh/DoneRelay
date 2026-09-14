import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { prepareSlackNotification, slackReceipt, sendSlackSelf } from '../skills/donerelay/scripts/runtime/slack.js';
const identity = { workspaceId: 'T123', userId: 'U123', isBot: false };
const conversation = { workspaceId: 'T123', channelId: 'D123', isIm: true, isMpim: false, membersComplete: true, members: ['U123'] };
const input = () => ({ kind: 'notification', task: 'Tests complete', message: 'All checks passed.', connectionId: 'existing-host-slack', identity: structuredClone(identity), conversation: structuredClone(conversation) });
const receipt = () => ({ connectionId: 'existing-host-slack', workspaceId: 'T123', channelId: 'D123', ok: true, ts: '1789370000.000001' });

test('Slack self notification reuses the supplied connection and sends exactly once to the verified self DM', async () => {
  const calls=[];
  const connector={id:'existing-host-slack',identity:async()=>{calls.push('identity');return identity},selfConversation:async who=>{assert.deepEqual(who,identity);calls.push('self');return conversation},send:async prepared=>{calls.push('send');assert.equal(prepared.channelId,'D123');return receipt()}};
  const result=await sendSlackSelf({task:'Tests',message:'Passed'},connector);
  assert.equal(result.status,'sent');assert.deepEqual(calls,['identity','self','send']);assert.equal(result.evidence,'host_reported_mcp_receipt');
});
test('unknown or bot identity blocks sending before destination discovery', async () => {
  for(const value of [null,{...identity,isBot:true},{...identity,userId:''},{...identity,workspaceId:''}]) {
    let queried=false;
    await assert.rejects(sendSlackSelf(input(),{id:'host',identity:async()=>value,selfConversation:async()=>{queried=true},send:async()=>{throw Error('must not send')}}),/identity/);
    assert.equal(queried,false);
  }
});
test('Slack refuses other people, group DMs, channels, incomplete membership and workspace mismatch', () => {
  for(const change of [{members:['U999']},{members:['U123','U999']},{isMpim:true},{isIm:false},{channelId:'C123'},{membersComplete:false},{members:[]},{workspaceId:'T999'}]) {
    assert.throws(()=>prepareSlackNotification({...input(),conversation:{...conversation,...change}}),/self-DM/);
  }
  assert.throws(()=>prepareSlackNotification({...input(),recipient:'U999'}),/connected user/);
});
test('Slack is notifications-only and never silently fans out or requests approval', () => {
  for(const kind of ['question','approval','approved','answer']) assert.throws(()=>prepareSlackNotification({...input(),kind}),/notifications only/);
  assert.throws(()=>prepareSlackNotification({...input(),channels:['slack','telegram']}),/fan out/);
  assert.equal(prepareSlackNotification({...input(),channels:['slack']}).status,'prepared');
});
test('Slack rendering uses one language and disables mention expansion and unfurls', () => {
  const en=prepareSlackNotification({...input(),message:'Result <!channel> <@U999> & links'});
  assert.doesNotMatch(en.message.text,/\p{Script=Han}|<!channel>|<@U999>/u);
  assert.match(en.message.text,/&lt;!channel&gt;/);assert.equal(en.message.mrkdwn,false);assert.equal(en.message.unfurl_links,false);assert.equal(en.message.parse,'none');
  const zh=prepareSlackNotification({...input(),task:'测试完成',message:'全部通过。',language:'auto'});
  assert.equal(zh.language,'zh');assert.doesNotMatch(zh.message.text,/NOTIFICATION|Task:/);
});
test('Slack rejects invalid and oversized content without truncating', () => {
  for(const message of ['', 'x'.repeat(2001),'hidden\u202etext']) assert.throws(()=>prepareSlackNotification({...input(),message}));
  assert.throws(()=>prepareSlackNotification({...input(),language:'fr'}));
});
test('Slack receipts require the exact connection, workspace, DM and provider timestamp', () => {
  const prepared=prepareSlackNotification(input());
  for(const change of [{connectionId:'other'},{workspaceId:'T999'},{channelId:'D999'},{ts:null},{ts:'guessed'},{ok:undefined}]) assert.throws(()=>slackReceipt(prepared,{...receipt(),...change}),/unconfirmed|unverified/);
  assert.equal(slackReceipt(prepared,{...receipt(),ok:false,error:'SECRET_FROM_PROVIDER'}).status,'failed');
  assert.ok(!JSON.stringify(slackReceipt(prepared,{...receipt(),ok:false,error:'SECRET_FROM_PROVIDER'})).includes('SECRET_FROM_PROVIDER'));
});
test('ambiguous Slack send failures are not retried and do not leak provider errors', async () => {
  let sends=0;
  const result=await sendSlackSelf(input(),{id:'existing-host-slack',identity:async()=>identity,selfConversation:async()=>conversation,send:async()=>{sends++;throw Error('fixture-private-provider-detail')}});
  assert.equal(result.status,'unknown');assert.equal(sends,1);assert.ok(!JSON.stringify(result).includes('fixture-private'));
});
test('a complete copied skill prepares and verifies Slack without Telegram config or a local daemon', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'donerelay-slack-'));
  try {
    fs.cpSync('skills/donerelay',path.join(dir,'skill'),{recursive:true});
    const helper=path.join(dir,'skill/scripts/relay.mjs');const env={PATH:process.env.PATH,DONERELAY_HOME:path.join(dir,'no-setup')};
    const run=(args,payload)=>spawnSync(process.execPath,[helper,'slack',...args],{cwd:dir,env,input:JSON.stringify(payload),encoding:'utf8'});
    const preparedResult=run(['prepare'],input());assert.equal(preparedResult.status,0,preparedResult.stderr);
    const prepared=JSON.parse(preparedResult.stdout);assert.equal(prepared.status,'prepared');
    const sent=run(['receipt'],{prepared,receipt:receipt()});assert.equal(sent.status,0);assert.equal(JSON.parse(sent.stdout).status,'sent');
    const failure=run(['receipt'],{prepared,receipt:{...receipt(),ok:false}});assert.equal(failure.status,2);
    assert.equal(fs.existsSync(env.DONERELAY_HOME),false);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('host lookup failures are redacted and never invoke message sending', async () => {
  for(const failing of ['identity','selfConversation']) {
    let sends=0;
    const connector={id:'host',identity:async()=>identity,selfConversation:async()=>conversation,send:async()=>{sends++}};
    connector[failing]=async()=>{throw Error('private-provider-detail')};
    await assert.rejects(sendSlackSelf(input(),connector),error=>!error.message.includes('private-provider-detail') && error.message.includes('No message was sent'));
    assert.equal(sends,0);
  }
});
test('generic request routing explains host Slack reuse without provisioning Telegram', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'donerelay-slack-route-'));
  try {
    const target=path.join(dir,'unconfigured');
    const result=spawnSync(process.execPath,['src/cli.js','request'],{env:{PATH:process.env.PATH,DONERELAY_HOME:target},input:JSON.stringify({kind:'notification',task:'test',message:'result',channels:['slack']}),encoding:'utf8'});
    assert.equal(result.status,1);assert.match(result.stderr,/host MCP connection/);assert.equal(fs.existsSync(target),false);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
