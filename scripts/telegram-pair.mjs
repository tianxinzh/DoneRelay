import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
const token=process.env.TELEGRAM_BOT_TOKEN;
if(!token) { console.error('Set TELEGRAM_BOT_TOKEN in your local environment.');process.exit(1); }
const code=randomBytes(12).toString('hex');
console.log(`Stop any existing bot poller. In a PRIVATE chat with your bot, send:\n/start ${code}\nThis pairing check expires in five minutes.`);
let offset=0,found=false;
try {
  const deadline=Date.now()+300000;
  while(Date.now()<deadline && !found) {
    const response=await fetch(`https://api.telegram.org/bot${token}/getUpdates`,{method:'POST',redirect:'error',
      headers:{'content-type':'application/json'},body:JSON.stringify({offset,timeout:20,allowed_updates:['message']}),signal:AbortSignal.timeout(30000)});
    const data=await response.json();if(!response.ok || !data.ok)throw new Error();
    for(const update of data.result) {
      offset=update.update_id+1;const m=update.message;
      if(m?.chat?.type==='private' && !m.from?.is_bot && m.text===`/start ${code}`) {
        console.log(`TELEGRAM_CHAT_ID=${m.chat.id}\nTELEGRAM_USER_ID=${m.from.id}`);found=true;break;
      }
    }
    if(!found)await sleep(500);
  }
  if(!found){console.error('Pairing expired. No identity was bound.');process.exitCode=1;}
} catch {console.error('Pairing failed. Check the token, network and existing webhook/poller. No identity was bound.');process.exitCode=1;}
