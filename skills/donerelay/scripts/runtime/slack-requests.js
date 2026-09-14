import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { localPaths, controlled, readPrivate, writePrivate } from './local.js';
import { prepareSlackRequest, slackReceipt } from './slack.js';
import { check, text, digest, parseReply } from './util.js';

const fresh = bytes => randomBytes(bytes).toString('hex').toUpperCase();
const reusable = r => !r.consumedAt && ['prepared', 'pending', 'approved', 'answered'].includes(r.status);
const timestamp = value => {
  check(typeof value === 'string' && /^\d{1,12}\.\d{6}$/.test(value), 'Invalid Slack message timestamp.');
  return BigInt(value.replace('.', ''));
};
const plain = value => value.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
const cleanMessage = m => m?.type === 'message' && !m.subtype && !m.bot_id && !m.app_id && !m.bot_profile && !m.edited && !m.hidden && !m.deleted && !m.attachments?.length && !m.files?.length;
function ttl(value, fallback) {
  const seconds = value ?? fallback;
  check(Number.isInteger(seconds) && seconds >= 1 && seconds <= 86400, 'ttlSeconds must be an integer from 1 to 86400.');
  return seconds * 1000;
}
function view(r) {
  return { id: r.id, sessionId: r.sessionId, kind: r.kind, status: r.status, binding: r.binding,
    expiresAt: r.expiresAt, answer: r.answer, replyTs: r.replyTs, consumedAt: r.consumedAt,
    mayExecute: false, evidence: 'host_reported_mcp_thread', ...(r.status === 'prepared' ? { prepared: r.prepared } : {}) };
}

// Short-lived helpers share private durable records. The host owns the live MCP session.
// A session is a cooperative workflow boundary, not authentication of a human or process.
export async function slackRequestCommand(command, input, { env = process.env, now = Date.now() } = {}) {
  check(input && typeof input === 'object' && !Array.isArray(input), 'Expected a Slack request object.');
  const paths = localPaths(env), file = path.join(paths.home, 'slack.json');
  return controlled(paths, () => {
    const state = fs.existsSync(file) ? readPrivate(file) : { version: 1, sessions: {}, requests: {} };
    check(state.version === 1 && state.sessions && state.requests, 'Unsupported Slack state.');
    for (const r of Object.values(state.requests)) {
      if (reusable(r) && (r.expiresAt <= now || !state.sessions[r.sessionId] || state.sessions[r.sessionId].expiresAt <= now)) r.status = 'expired';
      if (!reusable(r) && r.expiresAt < now - 7 * 86400000) delete state.requests[r.id];
    }
    for (const s of Object.values(state.sessions)) if (s.expiresAt < now - 7 * 86400000) delete state.sessions[s.id];
    let result;
    if (command === 'open') {
      const workflowId = text(input.workflowId, 'workflowId', 160);
      for (const s of Object.values(state.sessions)) if (s.workflowId === workflowId) {
        s.closed = true;
        for (const r of Object.values(state.requests)) if (r.sessionId === s.id && reusable(r)) r.status = 'cancelled';
      }
      check(Object.keys(state.sessions).length < 1000, 'Slack session limit reached; close workflows and allow history to expire.');
      const id = fresh(16), expiresAt = now + ttl(input.ttlSeconds, 3600);
      state.sessions[id] = { id, workflowId, expiresAt };
      result = { sessionId: id, expiresAt, status: 'open', mayExecute: false };
    } else {
      check(typeof input.sessionId === 'string' && /^[A-F0-9]{32}$/.test(input.sessionId), 'Invalid Slack session ID.');
      const session = state.sessions[input.sessionId];
      check(session && !session.closed && session.expiresAt > now, 'Slack workflow session is closed, expired or unknown.');
      if (command === 'close') {
        session.closed = true;
        for (const r of Object.values(state.requests)) if (r.sessionId === session.id && reusable(r)) r.status = 'cancelled';
        result = { status: 'closed', mayExecute: false };
      } else if (command === 'create') {
        check(Object.keys(state.requests).length < 10000, 'Slack request history limit reached.');
        const id = fresh(6), expiresAt = Math.min(session.expiresAt, now + ttl(input.ttlSeconds, 600));
        const prepared = prepareSlackRequest(input, { id, createdAt: now, expiresAt });
        const binding = digest(JSON.stringify({ sessionId: session.id, prepared }));
        const r = { id, sessionId: session.id, kind: input.kind, status: 'prepared', expiresAt, prepared, binding };
        state.requests[id] = r; result = view(r);
      } else {
        check(typeof input.id === 'string' && /^[A-F0-9]{12}$/.test(input.id), 'Invalid Slack request ID.');
        const r = state.requests[input.id];
        check(r && r.sessionId === session.id, 'Slack request does not belong to this workflow.');
        if (command === 'sent') {
          check(r.status === 'prepared', 'Slack delivery is already bound or this request is no longer sendable.');
          const receipt = slackReceipt(r.prepared, input.receipt);
          if (receipt.status === 'failed') r.status = 'failed';
          else {
            const ts = timestamp(receipt.providerMessageId);
            check(ts >= BigInt(r.prepared.createdAt - 5000) * 1000n && ts <= BigInt(now + 5000) * 1000n, 'Slack send timestamp is outside this request lifetime.');
            check(!Object.values(state.requests).some(other => other.parentTs === receipt.providerMessageId && other.prepared.connectionId === r.prepared.connectionId && other.prepared.channelId === r.prepared.channelId), 'Slack parent message is already bound.');
            r.parentTs = receipt.providerMessageId; r.status = 'pending';
          }
        } else if (command === 'ingest') {
          if (r.status === 'pending') ingest(r, input.snapshot, now);
        } else if (command === 'cancel') {
          if (reusable(r)) r.status = 'cancelled';
        } else if (command === 'take') {
          check(input.binding === r.binding, 'Slack operation binding changed.');
          check(!r.consumedAt && ['approved', 'answered', 'denied', 'expired', 'cancelled', 'failed'].includes(r.status), 'Slack result is pending or already consumed.');
          r.consumedAt = now;
          result = { ...view(r), mayExecute: r.status === 'approved' };
        } else check(command === 'get', 'Unknown Slack request command.');
        result ??= view(r);
      }
    }
    // No result, especially an execution grant, escapes before the commit succeeds.
    writePrivate(file, state);
    return result;
  });
}

function ingest(r, snapshot, now) {
  const p = r.prepared;
  check(snapshot?.connectionId === p.connectionId && snapshot.workspaceId === p.workspaceId && snapshot.channelId === p.channelId && snapshot.threadTs === r.parentTs,
    'Slack thread belongs to a different connection, workspace, DM or request.');
  check(snapshot.complete === true && snapshot.has_more !== true && !snapshot.response_metadata?.next_cursor && Array.isArray(snapshot.messages) && snapshot.messages.length > 0 && snapshot.messages.length <= 500,
    'Read the complete Slack thread, including its original message and every page, before deciding.');
  const unique = new Map();
  for (const m of snapshot.messages) {
    timestamp(m?.ts);
    check(!unique.has(m.ts) || JSON.stringify(unique.get(m.ts)) === JSON.stringify(m), 'Conflicting Slack messages share a timestamp.');
    unique.set(m.ts, m);
  }
  const parent = unique.get(r.parentTs);
  check(parent, 'Slack original message is missing.');
  // Slack sends through a user connection, so the original must also have that author.
  if (!cleanMessage(parent) || parent.user !== p.userId || typeof parent.text !== 'string' || plain(parent.text) !== plain(p.message.text)) {
    r.status = 'cancelled'; return;
  }
  const ordered = [...unique.values()].sort((a, b) => timestamp(a.ts) < timestamp(b.ts) ? -1 : 1);
  for (const m of ordered) {
    const ts = timestamp(m.ts);
    if (m.ts === r.parentTs || !cleanMessage(m) || m.user !== p.userId || m.thread_ts !== r.parentTs || typeof m.text !== 'string' ||
      ts <= timestamp(r.parentTs) || ts < BigInt(p.createdAt) * 1000n || ts >= BigInt(r.expiresAt) * 1000n || ts > BigInt(now) * 1000n) continue;
    let answer;
    try { answer = text(m.text.trim(), 'answer', 2000); } catch { continue; }
    if (r.kind === 'question') { r.answer = answer; r.status = 'answered'; }
    else {
      const direct = { approve: 'approve', deny: 'deny', '批准': 'approve', '拒绝': 'deny' }[answer.toLowerCase()];
      const numbered = parseReply(answer);
      const action = direct ?? (numbered?.id === r.id ? numbered.action : null);
      if (!['approve', 'deny'].includes(action)) continue;
      r.status = action === 'approve' ? 'approved' : 'denied';
    }
    r.replyTs = m.ts; return;
  }
}
