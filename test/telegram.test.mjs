import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/core.mjs';
import { Telegram } from '../src/telegram.mjs';
const config={token:'123:fake-test-token',chat:'7',user:'7'};
function setup(t,kind='approve') {
  const s=new Store();t.after(()=>s.close());const calls=[];
  const tg=new Telegram(config,s,async(url,options)=>{calls.push({url,...JSON.parse(options.body)});return {ok:true,json:async()=>({ok:true,result:{message_id:42}})};});
  const r=s.create({kind,title:'Test',...(kind==='approve'?{action:'deploy staging'}:{})});return {s,tg,r,calls};
}
function callback(id,{user=7,chat=7,messageId=42,type='private',decision='a'}={}) {
  return {callback_query:{id:'cb1',data:`${decision}:${id}`,from:{id:user,is_bot:false},message:{message_id:messageId,chat:{id:chat,type}}}};
}
test('Telegram sends plain text and compact operation-specific buttons',async t=>{
  const {s,tg,r,calls}=setup(t);await tg.deliver();assert.equal(s.get(r.id).delivery.status,'sent');
  assert.equal(calls[0].parse_mode,undefined);assert.equal(calls[0].chat_id,'7');
  assert.equal(calls[0].reply_markup.inline_keyboard[0][0].callback_data,`a:${r.id}`);
  await tg.handle(callback(r.id));assert.equal(s.get(r.id).status,'approved');
  await tg.handle(callback(r.id,{decision:'d'}));assert.equal(s.get(r.id).status,'approved');
});
for(const variation of [{user:8},{chat:8},{messageId:43},{type:'group'}])test(`reject untrusted callback ${JSON.stringify(variation)}`,async t=>{
  const {s,tg,r}=setup(t);await tg.deliver();await tg.handle(callback(r.id,variation));assert.equal(s.get(r.id).status,'pending');
});
test('a direct reply answers only the bound question',async t=>{
  const {s,tg,r}=setup(t,'ask');await tg.deliver();await tg.handle({message:{message_id:45,chat:{id:7,type:'private'},
    from:{id:7},text:'staging',reply_to_message:{message_id:42}}});assert.equal(s.get(r.id).answer,'staging');
});
test('forwarded approval text and free-form yes do not authorize',async t=>{
  const {s,tg,r}=setup(t);await tg.deliver();for(const m of [{text:'yes'},{text:`approve ${r.id}`,forward_origin:{type:'user'}}])
    await tg.handle({message:{chat:{id:7,type:'private'},from:{id:7},...m}});
  assert.equal(s.get(r.id).status,'pending');
});
test('failed Telegram send is queued and provider secrets are not stored',async t=>{
  const {s,r}=setup(t);const tg=new Telegram(config,s,async()=>{throw new Error(config.token);});await tg.deliver();
  assert.equal(s.get(r.id).delivery.status,'queued');assert.equal(s.get(r.id).delivery.lastError,'transport_error');
});
