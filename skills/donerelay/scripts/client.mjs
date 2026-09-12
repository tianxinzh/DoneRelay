import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

export class Client {
  constructor({url=process.env.DONERELAY_URL || 'http://127.0.0.1:8787',token=process.env.DONERELAY_API_TOKEN,fetchImpl=fetch}={}) {
    const parsed=new URL(url);
    if (parsed.username || parsed.password || parsed.search || parsed.hash || !['http:','https:'].includes(parsed.protocol) ||
        (parsed.protocol==='http:' && !['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))) {
      throw new Error('Use HTTPS, or HTTP on loopback only');
    }
    if (!token || token.length<32) throw new Error('Set DONERELAY_API_TOKEN (at least 32 characters)');
    this.url=url.replace(/\/$/,'');this.token=token;this.fetch=fetchImpl;
  }
  async call(path,value,signal) {
    const response=await this.fetch(this.url+path,{method:value===undefined?'GET':'POST',redirect:'error',
      headers:{authorization:`Bearer ${this.token}`,'content-type':'application/json'},
      body:value===undefined?undefined:JSON.stringify(value),
      signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
    const data=await response.json();
    if(!response.ok) throw new Error(`DoneRelay HTTP ${response.status}: ${data.error || 'request failed'}`);
    return data;
  }
  create(value,signal) { return this.call('/v1/requests',{...value,idempotencyKey:value.idempotencyKey || randomUUID()},signal); }
  status(id,signal) { return this.call(`/v1/requests/${encodeURIComponent(id)}`,undefined,signal); }
  cancel(id) { return this.call(`/v1/requests/${encodeURIComponent(id)}/cancel`,{}); }
  async wait(id,{signal,timeoutMs=3600000,intervalMs=1000}={}) {
    const deadline=Date.now()+timeoutMs;
    while(true) {
      signal?.throwIfAborted();
      const value=await this.status(id,signal);
      if(value.status!=='pending')return value;
      if(Date.now()>=deadline)throw new Error(`Local wait timed out; request ${id} is NOT approved. Check status or cancel it.`);
      await sleep(intervalMs,undefined,{signal});
    }
  }
}
export function exitCode(value) {
  if(['approved','answered','completed'].includes(value.status))return 0;
  if(value.status==='rejected')return 2;
  return 3;
}
export async function runCli(argv=process.argv.slice(2)) {
  const {values,positionals}=parseArgs({args:argv,allowPositionals:true,options:{
    title:{type:'string'},message:{type:'string'},action:{type:'string'},channel:{type:'string'},
    ttl:{type:'string'},key:{type:'string'},'no-wait':{type:'boolean'},help:{type:'boolean'}}});
  if(values.help || !positionals.length) {
    console.log('donerelay notify|ask|approve --title TEXT [--message TEXT] [--action EXACT_OPERATION] [--channel telegram|wechat] [--ttl SECONDS] [--key ID] [--no-wait]\ndonerelay status|wait|cancel REQUEST_ID\nSet DONERELAY_URL and DONERELAY_API_TOKEN. Approval succeeds only with status=approved.');return;
  }
  const client=new Client(),[command,id]=positionals;
  let value;
  if(['status','wait','cancel'].includes(command)) {
    if(!/^[a-f0-9]{24}$/.test(id || ''))throw new Error('Supply a valid request ID');
    value=await (command==='wait'?client.wait(id):client[command](id));
  } else if(['notify','ask','approve'].includes(command)) {
    value=await client.create({kind:command,title:values.title,message:values.message,action:values.action,
      channel:values.channel || 'telegram',ttlSeconds:Number(values.ttl || 3600),idempotencyKey:values.key});
    if(!values['no-wait']) {
      console.error(`Waiting for request ${value.id}. Ctrl-C stops waiting, not the server request.`);
      value=await client.wait(value.id,{timeoutMs:Number(values.ttl || 3600)*1000+5000});
    }
  } else throw new Error('Unknown command; use --help');
  console.log(JSON.stringify(value,null,2));
  // An explicit status query or --no-wait indicates transport success, NOT authorization.
  process.exitCode=values['no-wait'] || command==='status'?0:exitCode(value);
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  runCli().catch(error=>{console.error(error.message);process.exitCode=1;});
}
