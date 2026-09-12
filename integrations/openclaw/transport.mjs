import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
const execute=promisify(execFile);
export class WechatTransport {
  constructor({url,token,accountId='',fetchImpl=fetch,executeImpl=execute}) {
    const u=new URL(url);
    if(u.username||u.password||u.search||u.hash||!['https:','http:'].includes(u.protocol)||
      (u.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(u.hostname)))throw new Error('Use HTTPS or loopback HTTP');
    if(typeof token!=='string'||token.length<32)throw new Error('Missing WeChat transport credential');
    this.url=url.replace(/\/$/,'');this.token=token;this.accountId=accountId;this.fetch=fetchImpl;this.execute=executeImpl;
  }
  async call(route,payload={},signal) {
    const r=await this.fetch(this.url+'/v1/wechat/'+route,{method:'POST',redirect:'error',
      headers:{authorization:`Bearer ${this.token}`,'content-type':'application/json'},body:JSON.stringify(payload),
      signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000)});
    if(!r.ok)throw new Error(`WeChat bridge HTTP ${r.status}`);return r.json();
  }
  async once(signal) {
    const job=await this.call('claim',{},signal);if(!job)return false;
    if(!/^[a-f0-9]{24}$/.test(job.id)||!/^[a-f0-9]{32}$/.test(job.lease)||
      typeof job.target!=='string'||!job.target||typeof job.text!=='string'||job.text.length>4096)throw new Error('Invalid delivery lease');
    let ok=false;
    try {
      // No shell, user-supplied executable, or command interpretation. OpenClaw owns channel credentials.
      const args=['message','send','--channel','openclaw-weixin','--target',job.target,'--message',job.text,'--json'];
      if(this.accountId)args.push('--account',this.accountId);
      await this.execute('openclaw',args,{timeout:45000,maxBuffer:65536,windowsHide:true,signal});ok=true;
    } catch { /* Provider output can contain private information. Do not log it. */ }
    await this.call('ack',{id:job.id,lease:job.lease,ok},signal);return true;
  }
  async run(signal) {
    while(!signal.aborted) {
      try { await this.once(signal); } catch { if(!signal.aborted)console.error('WeChat delivery unavailable; retrying.'); }
      await sleep(1000,undefined,{signal}).catch(()=>{});
    }
  }
}
export function registerCommands(api,transport) {
  const config=api.pluginConfig || {};
  if(!config.senderId)throw new Error('Configure a bound WeChat senderId');
  api.registerCommand({name:'donerelay',description:'Reply to a DoneRelay request',acceptsArgs:true,requireAuth:true,
    handler:async ctx=>{
      // Use authenticated host metadata, never sender IDs or approval claims from message text.
      if(!ctx.isAuthorizedSender || (ctx.channelId ?? ctx.channel)!=='openclaw-weixin' ||
        ctx.senderId!==config.senderId || (config.accountId && ctx.accountId!==config.accountId))return {text:'DoneRelay: unauthorized channel or sender.'};
      if(typeof ctx.args!=='string'||ctx.args.length>2200)return {text:'Use /donerelay approve|reject|reply REQUEST_ID [answer]'};
      try {
        const result=await transport.call('reply',{senderId:ctx.senderId,text:ctx.args});
        return {text:`DoneRelay: ${result.status} (${result.id}).`};
      } catch { return {text:'DoneRelay: reply was not accepted. Check the ID, expiry, and reply type.'}; }
    }});
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const transport=new WechatTransport({url:process.env.DONERELAY_URL||'http://127.0.0.1:8787',
      token:process.env.DONERELAY_WECHAT_TOKEN,accountId:process.env.WECHAT_ACCOUNT_ID||''});
    const c=new AbortController();process.once('SIGINT',()=>c.abort());process.once('SIGTERM',()=>c.abort());
    await transport.run(c.signal);
  } catch {console.error('Unable to start WeChat worker; check its private configuration.');process.exitCode=1;}
}
