import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { Store, RelayError, tokenMatches, loadConfig, messageFor, parseReply, text } from './core.mjs';
import { Telegram } from './telegram.mjs';

async function body(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw new RelayError('Use application/json',415);
  const chunks=await new Promise((resolve,reject)=>{
    const chunks=[];let size=0,tooLarge=false;
    req.on('data',chunk=>{size+=chunk.length;if(size>16384){tooLarge=true;chunks.length=0;}else if(!tooLarge)chunks.push(chunk);});
    req.once('end',()=>tooLarge?reject(new RelayError('Body too large',413)):resolve(chunks));
    req.once('error',reject);
  });
  try {
    const value=JSON.parse(Buffer.concat(chunks).toString());
    if (!value || typeof value!=='object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new RelayError('Invalid JSON object'); }
}
export function createApp(config,store) {
  return createServer({requestTimeout:15000,headersTimeout:10000},async(req,res)=>{
    const send=(status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store',
      'x-content-type-options':'nosniff'});res.end(JSON.stringify(value));};
    try {
      const path=new URL(req.url,'http://localhost').pathname;
      if (req.method==='GET' && path==='/healthz') return send(200,{ok:true,version:'0.1.0'});
      if (req.headers.origin) throw new RelayError('Browser origins are not supported',403);
      const transport=path.startsWith('/v1/wechat/');
      const token=req.headers.authorization?.replace(/^Bearer /,'');
      if (!tokenMatches(token,transport?config.wechatToken:config.apiToken)) throw new RelayError('Unauthorized',401);
      if (transport && !config.wechatUser) throw new RelayError('WeChat is not configured',503);
      if (req.method==='POST' && path==='/v1/requests') {
        const value=await body(req);
        if ((value.channel ?? 'telegram')==='telegram' && !config.telegram.token) throw new RelayError('Telegram is not configured',503);
        if (value.channel==='wechat' && !config.wechatUser) throw new RelayError('WeChat is not configured',503);
        return send(201,store.create(value));
      }
      const match=path.match(/^\/v1\/requests\/([a-f0-9]{24})(\/cancel)?$/);
      if (match && req.method==='GET' && !match[2]) return send(200,store.get(match[1]));
      if (match && req.method==='POST' && match[2]) return send(200,store.cancel(match[1]));
      if (req.method==='POST' && path==='/v1/wechat/claim') {
        const r=store.claim('wechat');
        return send(200,r?{id:r.id,lease:r.lease,target:config.wechatTarget,text:messageFor(r,true)}:null);
      }
      if (req.method==='POST' && path==='/v1/wechat/ack') {
        const b=await body(req);
        text(b.id,'id',24);text(b.lease,'lease',32);
        if (typeof b.ok!=='boolean') throw new RelayError('ok must be boolean');
        if (store.row(b.id).channel!=='wechat') throw new RelayError('Wrong channel',403);
        return send(200,{accepted:store.ack(b.id,b.lease,b.ok)});
      }
      if (req.method==='POST' && path==='/v1/wechat/reply') {
        const b=await body(req);
        if (b.senderId!==config.wechatUser) throw new RelayError('Sender is not bound',403);
        const reply=parseReply(b.text); if (!reply) throw new RelayError('Use approve/reject/reply followed by the request ID');
        return send(200,store.resolve(reply.id,'wechat',b.senderId,reply.decision,reply.answer));
      }
      throw new RelayError('Not found',404);
    } catch(error) {
      if (!(error instanceof RelayError)) console.error('Internal request failure');
      if (!res.headersSent) send(error instanceof RelayError?error.status:500,
        {error:error instanceof RelayError?error.message:'Internal error'});
      else res.end();
    }
  });
}
export async function main() {
  process.umask(0o077);
  const config=loadConfig(),store=new Store(config.database),controller=new AbortController();
  const server=createApp(config,store);
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(config.port,config.host,resolve);});
  console.log(`DoneRelay listening on ${config.host}:${config.port}`);
  const telegram=config.telegram.token?new Telegram(config.telegram,store).run(controller.signal):Promise.resolve();
  const maintenance=setInterval(()=>{try{store.purge(config.retention);}catch{console.error('Database maintenance failed');}},60000);
  let stopping=false;
  const stop=async()=>{
    if(stopping)return;stopping=true;controller.abort();clearInterval(maintenance);
    await new Promise(resolve=>server.close(resolve));await telegram.catch(()=>{});store.close();
  };
  process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());
  telegram.catch(()=>{console.error('Transport stopped unexpectedly');process.exitCode=1;void stop();});
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  main().catch(error=>{console.error(error instanceof RelayError?error.message:'Unable to start DoneRelay');process.exitCode=1;});
}
