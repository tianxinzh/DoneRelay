import { setTimeout as sleep } from 'node:timers/promises';
import { messageFor, parseReply, RelayError } from './core.mjs';

export class Telegram {
  constructor(config, store, fetchImpl = fetch) { this.config=config; this.store=store; this.fetch=fetchImpl; }
  async call(method,payload,signal) {
    // Fixed origin; no caller-controlled API URL, redirect, or raw provider error logging.
    const timeout=AbortSignal.timeout(40000);
    const response=await this.fetch(`https://api.telegram.org/bot${this.config.token}/${method}`,{
      method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify(payload),
      signal:signal?AbortSignal.any([signal,timeout]):timeout });
    const data=await response.json();
    if (!response.ok || !data.ok) throw new Error('telegram_api_error');
    return data.result;
  }
  async deliver(signal) {
    const r=this.store.claim('telegram'); if (!r) return false;
    try {
      const payload={chat_id:this.config.chat,text:messageFor(r),link_preview_options:{is_disabled:true}};
      if (r.kind==='approve') payload.reply_markup={inline_keyboard:[[
        {text:'Approve once',callback_data:`a:${r.id}`},{text:'Reject',callback_data:`d:${r.id}`}]]};
      if (r.kind==='ask') payload.reply_markup={force_reply:true,selective:true};
      const message=await this.call('sendMessage',payload,signal);
      this.store.ack(r.id,r.lease,true,message.message_id);
    } catch { this.store.ack(r.id,r.lease,false); }
    return true;
  }
  trusted(message,user) {
    return message?.chat?.type==='private' && String(message.chat.id)===this.config.chat &&
      String(user?.id)===this.config.user && !user?.is_bot;
  }
  async handle(update) {
    const callback=update.callback_query;
    if (callback) {
      if (!this.trusted(callback.message,callback.from)) return;
      const match=callback.data?.match(/^([ad]):([a-f0-9]{24})$/);
      let result='Invalid or expired request';
      if (match) {
        try {
          const r=this.store.row(match[2]);
          if (String(callback.message.message_id)!==r.remote_id) throw new RelayError('Wrong message');
          const value=this.store.resolve(r.id,'telegram',String(callback.from.id),match[1]==='a'?'approve':'reject');
          result=value.status==='approved'?'Approved once':'Rejected';
        } catch (error) { if (!(error instanceof RelayError)) throw error; }
      }
      // Cosmetic acknowledgement failure must not undo a recorded decision.
      await this.call('answerCallbackQuery',{callback_query_id:callback.id,text:result}).catch(()=>{});
      return;
    }
    const message=update.message;
    if (!this.trusted(message,message?.from) || typeof message.text!=='string' || message.forward_origin || message.forward_date || message.via_bot) return;
    let reply=parseReply(message.text);
    if (!reply && message.reply_to_message) {
      const id=this.store.findRemote('telegram',message.reply_to_message.message_id);
      if (id) reply={id,decision:'reply',answer:message.text};
    }
    if (!reply) return;
    try { this.store.resolve(reply.id,'telegram',String(message.from.id),reply.decision,reply.answer); }
    catch (error) { if (!(error instanceof RelayError)) throw error; }
  }
  async run(signal) {
    const outgoing=async()=>{
      while (!signal.aborted) { await this.deliver(signal); await sleep(1100,undefined,{signal}).catch(()=>{}); }
    };
    const incoming=async()=>{
      while (!signal.aborted) {
        try {
          const updates=await this.call('getUpdates',{offset:Number(this.store.meta('telegram-offset') || 0),timeout:25,
            allowed_updates:['message','callback_query']},signal);
          for (const update of updates) {
            if (signal.aborted) break;
            await this.handle(update); this.store.meta('telegram-offset',update.update_id+1);
          }
        } catch {
          if (!signal.aborted) { console.error('Telegram polling unavailable; retrying (check bot/webhook configuration).');
            await sleep(3000,undefined,{signal}).catch(()=>{}); }
        }
      }
    };
    await Promise.all([outgoing(),incoming()]);
  }
}
