import { Store } from '../src/core.mjs';
import { createApp } from '../src/server.mjs';
import { Client } from '../skills/donerelay/scripts/client.mjs';
const token='offline-demo-token-not-for-production',s=new Store();
const server=createApp({apiToken:token,wechatToken:'',wechatUser:'',telegram:{token:'mock'}},s);
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try {
  const client=new Client({url:`http://127.0.0.1:${server.address().port}`,token});
  console.log('OFFLINE DEMO: real HTTP + SQLite; messaging and human response are SIMULATED.');
  for(const input of [{kind:'ask',title:'Choose deployment target'},
    {kind:'approve',title:'Deploy the tested build?',action:'deploy --target staging --version demo'},
    {kind:'notify',title:'Job finished',message:'Staging deployment simulation completed.'}]) {
    const r=await client.create(input),lease=s.claim('telegram');s.ack(r.id,lease.lease,true,'demo-'+r.id);
    if(input.kind==='ask')s.resolve(r.id,'telegram','simulated-human','reply','staging');
    if(input.kind==='approve')s.resolve(r.id,'telegram','simulated-human','approve');
    const result=await client.wait(r.id);console.log(`${input.kind}: ${result.status}${result.answer?' → '+result.answer:''}`);
  }
} finally {await new Promise(r=>server.close(r));s.close();}
