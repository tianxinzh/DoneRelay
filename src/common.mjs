import { timingSafeEqual, randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

export class RelayError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function invariant(ok, message, status = 400) {
  if (!ok) throw new RelayError(message, status);
}
export function text(value, field, max = 2000) {
  invariant(typeof value === 'string' && value.trim() && value.length <= max,
    `${field} must be nonempty text (maximum ${max} characters)`);
  invariant(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value),
    `${field} contains unsafe control characters`);
  return value;
}
export function secretEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export const randomId = () => randomBytes(8).toString('hex');
export const sleep = (ms, signal) => delay(ms, undefined, { signal });
export const log = (event, fields = {}) => console.error(JSON.stringify({ time: new Date().toISOString(), event, ...fields }));

// Never log fetch errors verbatim: Telegram URLs contain the bot token.
export async function jsonFetch(url, { timeout = 15000, signal, ...options } = {}) {
  const signals = [AbortSignal.timeout(timeout)];
  if (signal) signals.push(signal);
  let response;
  try {
    response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.any(signals) });
  } catch {
    throw new RelayError('Provider request failed or timed out', 502);
  }
  let data;
  try { data = await response.json(); } catch { throw new RelayError('Invalid provider response', 502); }
  if (!response.ok) {
    const error = new RelayError(`Provider HTTP ${response.status}`, 502);
    error.retryAfter = response.status === 429 ? Number(data?.parameters?.retry_after || 0) : 0;
    throw error;
  }
  return data;
}

export function formatRequest(r) {
  const scope = r.context && Object.keys(r.context).length ? `\nContext: ${JSON.stringify(r.context)}` : '';
  const body = r.kind === 'approval' ? `ACTION (review exactly):\n${r.action}` : `QUESTION:\n${r.question}`;
  const choices = r.choices?.length ? `\nChoices: ${r.choices.join(' | ')}${r.allowOther ? ' | other text' : ''}` : '';
  const instructions = r.kind === 'approval'
    ? `approve ${r.id} / reject ${r.id}\n或：批准 ${r.id} / 拒绝 ${r.id}\nOne operation only. No response is NOT approval.`
    : `reply ${r.id} <answer>\n或：回复 ${r.id} <回答>`;
  const output = `DoneRelay · ${r.title}\nTask: ${r.taskId}${scope}\nRequest: ${r.id}\n\n${body}${choices}\n\n${instructions}\nExpires: ${new Date(r.expiresAt).toISOString()}`;
  // An incomplete command/diff must never become an approval card.
  invariant(output.length <= 3500, 'Request is too long for safe chat review; review locally instead');
  return output;
}
