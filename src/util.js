import { setTimeout as sleep } from 'node:timers/promises';
import { createHash, timingSafeEqual } from 'node:crypto';
export class RelayError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function check(value, message, status = 400) {
  if (!value) throw new RelayError(message, status);
}
export function text(value, name, max = 1500) {
  check(typeof value === 'string' && value.trim().length > 0 && value.length <= max,
    `${name} must be a nonempty string of at most ${max} characters`);
  check(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value), `${name} contains unsafe control characters`);
  return value;
}
export const digest = (value) => createHash('sha256').update(value).digest('hex');
export function secretEqual(a, b) {
  return typeof a === 'string' && typeof b === 'string' &&
    timingSafeEqual(Buffer.from(digest(a), 'hex'), Buffer.from(digest(b), 'hex'));
}
export const delay = (ms, signal) => sleep(ms, undefined, { signal }).catch((e) => { if (e.name !== 'AbortError') throw e; });
export function safeError(error) {
  return error instanceof RelayError ? error.message : 'Operation failed; inspect configuration locally (credentials omitted).';
}
export function parseReply(input) {
  if (typeof input !== 'string') return null;
  const match = input.trim().match(/^(approve|deny|answer|批准|拒绝|回答)\s+([a-f0-9]{12})(?:\s+([\s\S]+))?$/i);
  if (!match) return null;
  const action = ({ approve: 'approve', deny: 'deny', answer: 'answer', '批准': 'approve', '拒绝': 'deny', '回答': 'answer' })[match[1].toLowerCase()];
  if (action === 'answer' ? !match[3]?.trim() : Boolean(match[3])) return null;
  return { action, id: match[2].toUpperCase(), answer: match[3]?.trim() };
}
