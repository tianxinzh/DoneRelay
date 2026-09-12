import { createHash } from 'node:crypto';
// The owner of a Codex app-server connection calls this from its JSON-RPC request handler.
// This does not attach to existing desktop or cloud sessions, or execute commands itself.
export async function commandApproval(params,{client,signal,channel='telegram'}={}) {
  let request,accepted=false;
  const deny={decision:'decline'};
  try {
    signal?.throwIfAborted();
    if(!client || !signal || typeof params?.command!=='string' || !params.command.trim() ||
      typeof params.cwd!=='string' || !params.cwd.trim() || !params.threadId || !params.turnId || !params.itemId)return deny;
    // Do not translate session permissions, policy amendments, or network exceptions into one-click approval.
    if(params.additionalPermissions || params.networkApprovalContext || params.proposedExecpolicyAmendment ||
      params.proposedNetworkPolicyAmendments)return deny;
    if(params.availableDecisions && !params.availableDecisions.includes('accept'))return deny;
    const action=JSON.stringify({threadId:params.threadId,turnId:params.turnId,itemId:params.itemId,
      cwd:params.cwd,command:params.command});
    if(action.length>1600)return deny; // Never approve a truncated command.
    const hash=createHash('sha256').update(action).digest('hex');
    request=await client.create({kind:'approve',channel,title:'Codex command approval',
      message:'Approve this exact command once. Native host policy still applies.',action,ttlSeconds:3600},signal);
    const result=await client.wait(request.id,{signal});
    signal.throwIfAborted();
    accepted=result.id===request.id && result.kind==='approve' && result.status==='approved' &&
      result.action===action && result.actionHash===hash;
    return accepted?{decision:'accept'}:deny;
  } catch {return deny;}
  finally {if(request && !accepted)await client.cancel(request.id).catch(()=>{});}
}
