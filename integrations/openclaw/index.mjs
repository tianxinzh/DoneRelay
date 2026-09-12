import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
import { WechatTransport, registerCommands } from './transport.mjs';
export default definePluginEntry({id:'donerelay-wechat',name:'DoneRelay WeChat',
  description:'Deterministic, user-bound replies to DoneRelay requests (experimental)',
  register(api) {
    const c=api.pluginConfig || {};
    registerCommands(api,new WechatTransport({url:c.url||'http://127.0.0.1:8787',
      token:process.env.DONERELAY_WECHAT_TOKEN,accountId:c.accountId||''}));
  }});
