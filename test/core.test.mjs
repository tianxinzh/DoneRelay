import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store,validate,parseReply,digest,messageFor,loadConfig,tokenMatches } from '../src/core.mjs';
const input={kind:'approve',title:'Deploy staging',action:'deploy --environment staging',ttlSeconds:30};
function ready(s,value=input) {const r=s.create(value),c=s.claim(r.channel);assert.ok(s.ack(r.id,c.lease,true,'42'));return r;}
for(const value of [{...input,kind:'other'},{...input,action:''},{...input,action:'a\u202eb'},
  {...input,channel:'sms'},{...input,ttlSeconds:1},{...input,actor:'me'},{...input,title:'a'.repeat(101)}]) {
  test(`reject malformed input ${JSON.stringify(value)}`,()=>assert.throws(()=>validate(value)));
}
test('idempotent create returns original; payload change conflicts',()=>{
  const s=new Store();try{const r=s.create({...input,idempotencyKey:'job1'});
    assert.equal(s.create({...input,idempotencyKey:'job1'}).id,r.id);
    assert.throws(()=>s.create({...input,idempotencyKey:'job1',action:'other'}),/different content/);
    assert.equal(r.actionHash,digest(input.action));assert.equal(r.lease,undefined);
  }finally{s.close();}
});
test('approval records one decision, never a second execution authorization transition',()=>{
  const s=new Store();try{const r=ready(s);assert.equal(s.resolve(r.id,'telegram','7','approve').status,'approved');
    assert.throws(()=>s.resolve(r.id,'telegram','7','approve'),/not awaiting/);assert.equal(s.cancel(r.id).status,'approved');
  }finally{s.close();}
});
test('wrong channel, wrong response type, and undelivered requests cannot approve',()=>{
  const s=new Store();try{const r=s.create(input);assert.throws(()=>s.resolve(r.id,'telegram','7','approve'));
    const c=s.claim('telegram');s.ack(r.id,c.lease,true,'42');assert.throws(()=>s.resolve(r.id,'wechat','7','approve'));
    assert.throws(()=>s.resolve(r.id,'telegram','7','reply','yes'));assert.equal(s.get(r.id).status,'pending');
  }finally{s.close();}
});
test('expiry, cancel, rejection, questions and notifications are distinct',()=>{
  let now=1000;const s=new Store(':memory:',()=>now);try{
    const r=ready(s);now+=30000;assert.equal(s.get(r.id).status,'expired');assert.throws(()=>s.resolve(r.id,'telegram','7','approve'));
    const a=ready(s,{kind:'ask',title:'Which branch?'});assert.equal(s.resolve(a.id,'telegram','7','reply','staging').answer,'staging');
    const n=ready(s,{kind:'notify',title:'Finished'});assert.equal(s.get(n.id).status,'completed');
    const d=ready(s);assert.equal(s.resolve(d.id,'telegram','7','reject').status,'rejected');
    const c=ready(s);assert.equal(s.cancel(c.id).status,'cancelled');
  }finally{s.close();}
});
test('leases recover, stale acknowledgments fail, retry attempts are bounded',()=>{
  let now=1000;const s=new Store(':memory:',()=>now);try{
    const r=s.create({...input,ttlSeconds:3600});let c=s.claim('telegram');const old=c.lease;
    assert.equal(s.claim('telegram'),null);now+=61000;c=s.claim('telegram');assert.notEqual(c.lease,old);
    assert.equal(s.ack(r.id,old,true,'42'),false);s.ack(r.id,c.lease,false);
    for(let i=0;i<3;i++){now+=61000;c=s.claim('telegram');s.ack(r.id,c.lease,false);}
    assert.equal(s.get(r.id).status,'failed');assert.equal(s.claim('telegram'),null);
  }finally{s.close();}
});
test('SQLite persists pending request and polling offset across restart',()=>{
  const dir=mkdtempSync(join(tmpdir(),'donerelay-'));try{const path=join(dir,'state.sqlite');let s=new Store(path);
    const r=s.create(input);s.meta('telegram-offset',91);s.close();s=new Store(path);
    assert.equal(s.get(r.id).status,'pending');assert.equal(s.meta('telegram-offset'),'91');s.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('purge removes old terminal records and their audit history',()=>{
  let now=1000;const s=new Store(':memory:',()=>now);try{const r=ready(s);s.cancel(r.id);now+=8*86400000;s.purge(7);
    assert.throws(()=>s.get(r.id),/not found/);assert.equal(s.db.prepare('SELECT count(*) AS n FROM audit').get().n,0);
  }finally{s.close();}
});
test('reply parsing is exact, supports Chinese, never infers authorization',()=>{
  const id='a'.repeat(24);assert.equal(parseReply(`批准 ${id}`).decision,'approve');
  assert.equal(parseReply(`/donerelay reply ${id} staging\nplease`).answer,'staging\nplease');
  for(const t of ['yes','do it',`approve ${id} extra`,`approve ${id}x`])assert.equal(parseReply(t),null);
});
test('full approval fits Telegram limit even at field maxima',()=>{
  const s=new Store();try{const r=s.create({...input,title:'a'.repeat(100),message:'b'.repeat(1000),action:'c'.repeat(1600)});
    assert.ok(messageFor(r,true).length<4096);assert.ok(messageFor(r).includes(r.actionHash));
  }finally{s.close();}
});
test('configuration rejects missing, partial or shared credentials',()=>{
  const base={DONERELAY_API_TOKEN:'a'.repeat(32)};assert.throws(()=>loadConfig(base));
  assert.throws(()=>loadConfig({...base,TELEGRAM_BOT_TOKEN:'123:abc'}));
  assert.throws(()=>loadConfig({...base,WECHAT_USER_ID:'wxid',DONERELAY_WECHAT_TOKEN:base.DONERELAY_API_TOKEN}));
  assert.equal(loadConfig({...base,WECHAT_USER_ID:'wxid',DONERELAY_WECHAT_TOKEN:'b'.repeat(32)}).host,'127.0.0.1');
  assert.equal(tokenMatches('bad',base.DONERELAY_API_TOKEN),false);
});

test('a crash on the final send lease eventually fails closed',()=>{
  let now=1000;const s=new Store(':memory:',()=>now);try{
    const r=s.create({...input,ttlSeconds:3600});
    for(let i=0;i<5;i++){assert.ok(s.claim('telegram'));now+=61000;}
    assert.equal(s.claim('telegram'),null);assert.equal(s.get(r.id).status,'failed');
  }finally{s.close();}
});
