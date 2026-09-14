import { randomUUID } from 'node:crypto';
import { check, text } from './util.js';
import { resolveLanguage, words } from './language.js';

// Host-mediated transport: the authenticated MCP connection stays inside Codex/Claude.
// Normalized identity, conversation and receipt fields must come from that SAME connection.
// These local checks are routing validation, not cryptographic attestation of host tool output.
const userId = value => typeof value === 'string' && /^[UW][A-Z0-9]{2,}$/.test(value);
const teamId = value => typeof value === 'string' && /^T[A-Z0-9]{2,}$/.test(value);
const dmId = value => typeof value === 'string' && /^D[A-Z0-9]{2,}$/.test(value);
const escapeSlack = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function prepareSlackNotification(input) {
  check(input && typeof input === 'object' && !Array.isArray(input), 'Expected a Slack notification object.');
  check((input.kind ?? 'notification') === 'notification', 'slack prepare handles notifications only; use slack create for session-bound questions and approvals.');
  check(input.recipient === undefined || input.recipient === 'self', 'Slack notifications can only target the connected user.');
  check(input.channels === undefined || (Array.isArray(input.channels) && input.channels.length === 1 && input.channels[0] === 'slack'), 'Prepare Slack delivery separately; do not silently switch or fan out channels.');
  const connectionId = text(input.connectionId, 'connectionId', 160);
  const identity = input.identity;
  check(identity && userId(identity.userId) && teamId(identity.workspaceId) && identity.isBot === false,
    'Resolve the authenticated human user and workspace from the existing Slack connection; bot identity or guessed identity is not sufficient.');
  const conversation = input.conversation;
  check(conversation && dmId(conversation.channelId) && conversation.workspaceId === identity.workspaceId &&
    conversation.isIm === true && conversation.isMpim === false && conversation.membersComplete === true &&
    Array.isArray(conversation.members) && conversation.members.length > 0 && conversation.members.every(id => id === identity.userId),
  'Verify a private self-DM in the same workspace with complete membership containing only the connected user.');
  const task = text(input.task, 'task', 160);
  const message = text(input.message, 'message', 2000);
  const language = resolveLanguage(input.language ?? 'auto', message);
  const w = words(language);
  const body = `DoneRelay | ${w.notification}\n${w.task}: ${task}\n\n${message}`;
  return {
    status: 'prepared', transport: 'host_slack_mcp', kind: 'notification', connectionId,
    workspaceId: identity.workspaceId, userId: identity.userId, channelId: conversation.channelId,
    language, clientMessageId: randomUUID(),
    // Escaping prevents content such as <!channel> or <@USER> from becoming a mention.
    message: { text: escapeSlack(body), mrkdwn: false, parse: 'none', link_names: false, unfurl_links: false, unfurl_media: false },
  };
}
export function slackReceipt(prepared, receipt) {
  check(prepared?.status === 'prepared' && prepared.transport === 'host_slack_mcp' && ['notification', 'question', 'approval'].includes(prepared.kind) &&
    userId(prepared.userId) && teamId(prepared.workspaceId) && dmId(prepared.channelId), 'Expected a prepared Slack notification.');
  // Success is accepted only from the same connection, workspace and exact DM, with a real message timestamp.
  check(receipt?.connectionId === prepared.connectionId && receipt.workspaceId === prepared.workspaceId,
    'Slack result belongs to a different or unverified connection/workspace. Delivery is unconfirmed; inspect the self-DM before retrying.');
  if (receipt.ok === false) return { status: 'failed', channel: 'slack', error: 'Slack rejected the send. Check the existing connection permissions; do not switch recipients.' };
  check(receipt.ok === true && receipt.channelId === prepared.channelId && typeof receipt.ts === 'string' && /^\d+\.\d{6}$/.test(receipt.ts),
    'Slack delivery is unconfirmed. Inspect the self-DM before retrying; do not assume the send failed.');
  return { status: 'sent', kind: prepared.kind, channel: 'slack', workspaceId: prepared.workspaceId,
    userId: prepared.userId, providerChatId: prepared.channelId, providerMessageId: receipt.ts,
    evidence: 'host_reported_mcp_receipt' };
}

export function prepareSlackRequest(input, { id, createdAt, expiresAt }) {
  check(['question', 'approval'].includes(input?.kind), 'Slack requests must be questions or approvals.');
  check(input.capabilities?.readThread === true && input.capabilities?.rawMessages === true,
    'Slack replies require complete thread reads with original message, author and message metadata.');
  const prepared = prepareSlackNotification({ ...input, kind: 'notification' });
  const w = words(prepared.language);
  const hint = prepared.language === 'zh'
    ? (input.kind === 'approval' ? '请在本条消息的讨论串中回复“批准”或“拒绝”。' : '请在本条消息的讨论串中填写你的答案。')
    : (input.kind === 'approval' ? 'Reply in this message’s thread with approve or deny.' : 'Reply in this message’s thread with your answer.');
  prepared.message.text = escapeSlack(`DoneRelay | ${w[input.kind]}\n${w.task}: ${input.task}\n${w.request}: ${id}\n\n${input.message}\n\n${w.expires}: ${new Date(expiresAt).toISOString()}\n${hint}`);
  return { ...prepared, kind: input.kind, id, createdAt, expiresAt };
}

// Embedders can bind these callbacks to their already authenticated host MCP tools.
// The standalone CLI cannot call tools owned by another running agent process.
export async function sendSlackSelf(input, connector) {
  check(connector && typeof connector.identity === 'function' && typeof connector.selfConversation === 'function' && typeof connector.send === 'function',
    'The host Slack connection must provide identity, self-DM lookup, and message-send capabilities.');
  let identity;
  try { identity = await connector.identity(); }
  catch { check(false, 'Slack identity lookup failed; check the existing host connection. No message was sent.'); }
  // Validate identity before any destination lookup, let alone a send.
  check(identity && userId(identity.userId) && teamId(identity.workspaceId) && identity.isBot === false, 'Slack authenticated human identity is unavailable.');
  let conversation;
  try { conversation = await connector.selfConversation(identity); }
  catch { check(false, 'Slack self-DM lookup failed; check the existing host connection. No message was sent.'); }
  const prepared = prepareSlackNotification({ ...input, connectionId: connector.id, identity, conversation });
  try {
    const receipt = await connector.send(prepared);
    return slackReceipt(prepared, receipt);
  } catch {
    return { status: 'unknown', channel: 'slack', error: 'Slack delivery is unconfirmed. Inspect the self-DM before retrying; no automatic resend was attempted.' };
  }
}
