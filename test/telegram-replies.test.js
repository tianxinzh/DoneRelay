import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';
import { Relay } from '../src/relay.js';
import { Telegram } from '../src/channels/telegram.js';
import { Client } from '../src/client.js';
import { makeServer } from '../src/server.js';
function setup(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'donerelay-direct-'));let now=Date.now();
  const store=new Store(path.join(dir,'state.json'),()=>now);const sent=[];let fail=false;let receipt;
  const telegram=new Telegram({token:'123:fixture',chatId:'10',userId:'10',store,fetchImpl:async(url,options)=>{
    if(fail)throw Error('fixture transport failure');
    const body=JSON.parse(options.body);const message={message_id:sent.length+1,chat:{id:10,type:'private'},from:{id:123,is_bot:true},text:body.text};
    sent.push({url,body,message});
    return new Response(JSON.stringify({ok:true,result:receipt ?? message}));
  }});
  const relay=new Relay(store,{telegram},()=>now);telegram.relay=relay;
  const request=(kind='question',extra={})=>relay.create({kind,task:'test',message:kind==='question'?'Which label?':'Create one disposable marker.',...extra});
  const reply=(r,text,patch={})=>({message:{message_id:999,chat:{id:10,type:'private'},from:{id:10,is_bot:false},text,
    reply_to_message:structuredClone(sent.find(s=>String(s.message.message_id)===r.deliveries.telegram.providerMessageId)?.message),...patch}});
  t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true})});
  return {store,relay,telegram,sent,request,reply,advance:ms=>now+=ms,setFailure:value=>fail=value,setReceipt:value=>receipt=value};
}
test('a direct plain-text Telegram answer reaches the same waiting HTTP caller',async t=>{
  const f=setup(t);const token='t'.repeat(32);const server=makeServer(f.relay,token);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const client=new Client({DONERELAY_API_TOKEN:token,DONERELAY_URL:`http://127.0.0.1:${server.address().port}`});
  const r=await client.create({kind:'question',task:'test',message:'Which label?'});
  assert.deepEqual(r.deliveries.telegram,{status:'sent',providerMessageId:'1',providerChatId:'10',providerBotId:'123'});
  assert.equal(f.sent[0].body.reply_markup.force_reply,true);
  assert.equal(f.sent[0].body.reply_markup.input_field_placeholder,'Type your answer');
  const waiting=client.wait(r.id);await f.telegram.handle(f.reply(r,'BLUE'));
  const result=await waiting;assert.equal(result.id,r.id);assert.equal(result.status,'answered');assert.equal(result.answer,'BLUE');
});
test('questions preserve multiline text and command-looking answers cannot approve an operation',async t=>{
  const f=setup(t);const question=await f.request();const approval=await f.request('approval');
  await f.telegram.handle(f.reply(question,`approve ${approval.id}`));
  assert.equal(f.store.get(question.id).status,'pending');assert.equal(f.store.get(approval.id).status,'pending');
  await f.telegram.handle(f.reply(question,'Use BLUE\nKeep GREEN as fallback.'));
  assert.equal(f.store.get(question.id).answer,'Use BLUE\nKeep GREEN as fallback.');
  const other=await f.request();await f.telegram.handle(f.reply(other,'approve'));assert.equal(f.store.get(other.id).status,'answered');
  assert.equal(f.store.get(approval.id).status,'pending');
});
test('direct approvals require explicit verbs and preserve single-use decisions',async t=>{
  const f=setup(t);const r=await f.request('approval');
  for(const text of ['yes','okay','approve anything','deny later']){
    await f.telegram.handle(f.reply(r,text));assert.equal(f.store.get(r.id).status,'pending');
  }
  await f.telegram.handle(f.reply(r,'approve'));assert.equal(f.store.get(r.id).status,'approved');
  const decided=f.store.get(r.id);await f.telegram.handle(f.reply(r,'deny'));assert.deepEqual(f.store.get(r.id),decided);
  const denied=await f.request('approval');await f.telegram.handle(f.reply(denied,'deny'));assert.equal(f.store.get(denied.id).status,'denied');
});
test('another sender, chat, or group cannot resolve a direct reply',async t=>{
  const f=setup(t);const r=await f.request();const before=f.sent.length;
  for(const patch of [{from:{id:11}},{chat:{id:11,type:'private'}},{chat:{id:10,type:'group'}}])await f.telegram.handle(f.reply(r,'BLUE',patch));
  assert.equal(f.store.get(r.id).status,'pending');assert.equal(f.sent.length,before);
});
test('unknown, forwarded, copied, external and wrong-bot reply targets grant nothing',async t=>{
  const f=setup(t);const r=await f.request('approval');
  for(const change of [u=>u.message.reply_to_message.message_id+=1000,u=>u.message.reply_to_message.from.id=456,
    u=>u.message.reply_to_message.chat.id=11,u=>u.message.reply_to_message.forward_origin={},
    u=>u.message.forward_origin={},u=>u.message.external_reply={},u=>delete u.message.reply_to_message.from]){
    const u=f.reply(r,'approve');change(u);await f.telegram.handle(u);assert.equal(f.store.get(r.id).status,'pending');
  }
  const copied=f.reply(r,`approve ${r.id}`);copied.message.reply_to_message.message_id=10000;
  copied.message.reply_to_message.text=`DoneRelay request ${r.id}`;await f.telegram.handle(copied);
  assert.equal(f.store.get(r.id).status,'pending');
});
test('reply binding wins over conflicting explicit IDs while matching numbered commands still work',async t=>{
  const f=setup(t);const a=await f.request();const b=await f.request();
  await f.telegram.handle(f.reply(a,`answer ${b.id} BLUE`));assert.equal(f.store.get(a.id).status,'pending');assert.equal(f.store.get(b.id).status,'pending');
  await f.telegram.handle(f.reply(a,`answer ${a.id} GREEN`));assert.equal(f.store.get(a.id).answer,'GREEN');
  const standalone=f.reply(b,`answer ${b.id} BLUE`);delete standalone.message.reply_to_message;
  await f.telegram.handle(standalone);assert.equal(f.store.get(b.id).answer,'BLUE');
});
test('expiry, cancellation, and duplicate question replies cannot change the terminal result',async t=>{
  const f=setup(t);const expired=await f.request('question',{ttlSeconds:1});f.advance(1001);await f.telegram.handle(f.reply(expired,'BLUE'));
  assert.equal(f.store.get(expired.id).status,'expired');
  const cancelled=await f.request();f.relay.cancel(cancelled.id);await f.telegram.handle(f.reply(cancelled,'BLUE'));assert.equal(f.store.get(cancelled.id).status,'cancelled');
  const answered=await f.request();await f.telegram.handle(f.reply(answered,'BLUE'));const before=f.store.get(answered.id);
  await f.telegram.handle(f.reply(answered,'GREEN'));assert.deepEqual(f.store.get(answered.id),before);
});
test('restart retains message bindings but cancels pending requests',async t=>{
  const f=setup(t);const r=await f.request();const incoming=f.reply(r,'BLUE');f.store.close();
  const reopened=new Store(f.store.file);const relay=new Relay(reopened,{telegram:f.telegram});f.telegram.store=reopened;f.telegram.relay=relay;
  try{assert.equal(reopened.get(r.id).deliveries.telegram.providerMessageId,r.deliveries.telegram.providerMessageId);
    await f.telegram.handle(incoming);assert.equal(reopened.get(r.id).status,'cancelled');assert.equal(reopened.get(r.id).reason,'service_restarted');
  }finally{reopened.close()}
});
test('unconfirmed delivery and malformed provider receipts never establish a reply binding',async t=>{
  const f=setup(t);
  for(const receipt of [{},{message_id:0,chat:{id:10,type:'private'},from:{id:123,is_bot:true}},
    {message_id:1,chat:{id:11,type:'private'},from:{id:123,is_bot:true}}]){
    f.setReceipt(receipt);const r=await f.request();assert.equal(r.deliveries.telegram.status,'failed');assert.equal(r.deliveries.telegram.providerMessageId,undefined);
  }
  f.setReceipt(undefined);const r=await f.request();f.store.patch(r.id,{deliveries:{telegram:{...r.deliveries.telegram,status:'failed'}}});
  await f.telegram.handle(f.reply(r,'BLUE'));assert.equal(f.store.get(r.id).status,'pending');
});
test('media, blank, oversized and unsafe answers fail; reply text never changes preferences',async t=>{
  const f=setup(t);const r=await f.request();
  for(const text of [undefined,' ','a'.repeat(2001),'\u202eunsafe']){await f.telegram.handle(f.reply(r,text));assert.equal(f.store.get(r.id).status,'pending');}
  await f.telegram.handle(f.reply(r,'/language zh'));assert.equal(f.relay.preference(),'auto');assert.equal(f.store.get(r.id).answer,'/language zh');
  const n=await f.request('notification');await f.telegram.handle(f.reply(n,'BLUE'));assert.equal(f.store.get(n.id).status,'sent');
});
test('localized reply prompts and acknowledgements use the request language',async t=>{
  const f=setup(t);const q=await f.request('question',{language:'zh',task:'测试',message:'请选择颜色'});
  assert.match(f.sent[0].body.text,/直接回复/);assert.equal(f.sent[0].body.reply_markup.input_field_placeholder,'请输入回答');
  await f.telegram.handle(f.reply(q,'蓝色'));assert.equal(f.store.get(q.id).answer,'蓝色');assert.equal(f.sent.at(-1).body.text,`${q.id}: 已回答`);
  const a=await f.request('approval',{language:'zh',task:'测试',message:'创建一个测试文件。'});
  await f.telegram.handle(f.reply(a,'拒绝'));assert.equal(f.store.get(a.id).status,'denied');assert.equal(f.sent.at(-1).body.text,`${a.id}: 已拒绝`);
});
test('acknowledgement failure cannot undo or repeat a persisted answer',async t=>{
  const f=setup(t);const r=await f.request();f.setFailure(true);
  await assert.rejects(f.telegram.handle(f.reply(r,'BLUE')));assert.equal(f.store.get(r.id).answer,'BLUE');
  f.setFailure(false);await f.telegram.handle(f.reply(r,'GREEN'));assert.equal(f.store.get(r.id).answer,'BLUE');
});
